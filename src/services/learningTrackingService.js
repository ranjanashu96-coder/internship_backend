import { Op } from "sequelize";
import {
  ChapterResource,
  LiveClass,
  StudentResourceProgress,
  StudentLiveClassProgress,
  StudentChapterEngagement,
} from "../models/index.js";

import { AppError } from "../utils/response.js";

export const VIDEO_COMPLETION_PERCENT = 95;
export const LIVE_ATTENDANCE_PERCENT = 80;

// ✅ No-video chapter me minimum 10 minutes
export const NON_VIDEO_REQUIRED_SECONDS = 10 * 60;

const percentage = (done, total) => {
  const d = Number(done || 0);
  const t = Number(total || 0);

  if (t <= 0) return 0;

  return Number(
    Math.min(
      100,
      Math.max(
        0,
        (d / t) * 100,
      ),
    ).toFixed(2),
  );
};

export const getChapterLearningRequirements =
  async ({
    studentId,
    chapterId,
  }) => {
    /*
    |--------------------------------------------------------------------------
    | 1. VIDEO REQUIREMENTS
    |--------------------------------------------------------------------------
    */

    const videos =
      await ChapterResource.findAll({
        where: {
          chapter_id: chapterId,
          resource_type: "video",
          status: "active",
        },

        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
      });

    const videoIds =
      videos.map((v) =>
        Number(v.id),
      );

    const videoRows =
      videoIds.length
        ? await StudentResourceProgress.findAll(
            {
              where: {
                student_id:
                  studentId,

                resource_id: {
                  [Op.in]:
                    videoIds,
                },
              },
            },
          )
        : [];

    const videoMap =
      new Map(
        videoRows.map(
          (r) => [
            Number(
              r.resource_id,
            ),
            r,
          ],
        ),
      );

    const videoRequirements =
      videos.map(
        (video) => {
          const row =
            videoMap.get(
              Number(video.id),
            );

          const duration =
            Number(
              row?.duration_seconds ||
                video.duration_seconds ||
                0,
            );

          const watched =
            Math.min(
              duration ||
                Number.MAX_SAFE_INTEGER,

              Number(
                row?.watched_seconds ||
                  0,
              ),
            );

          const progress =
            percentage(
              watched,
              duration,
            );

          return {
            resource_id:
              Number(video.id),

            title:
              video.title,

            duration_seconds:
              duration,

            watched_seconds:
              Number(
                watched.toFixed(
                  2,
                ),
              ),

            last_position_seconds:
              Number(
                row?.last_position_seconds ||
                  0,
              ),

            progress_percentage:
              progress,

            is_completed:
              Boolean(
                row?.is_completed,
              ) ||
              (
                duration > 0 &&
                progress >=
                  VIDEO_COMPLETION_PERCENT
              ),
          };
        },
      );

    /*
    |--------------------------------------------------------------------------
    | 2. NO-VIDEO CHAPTER ENGAGEMENT
    |--------------------------------------------------------------------------
    |
    | Agar chapter me ek bhi active video nahi hai,
    | tab student ko 10 minute chapter par rehna hoga.
    |
    | Agar video hai:
    | engagement timer ignore hoga.
    |--------------------------------------------------------------------------
    */

    const hasVideo =
      videoRequirements.length >
      0;

    let chapterEngagement =
      null;

    if (!hasVideo) {
      const engagementRow =
        await StudentChapterEngagement.findOne(
          {
            where: {
              student_id:
                studentId,

              chapter_id:
                chapterId,
            },
          },
        );

      const engagedSeconds =
        Number(
          engagementRow
            ?.engaged_seconds ||
            0,
        );

      const engagementCompleted =
        Boolean(
          engagementRow
            ?.is_completed,
        ) ||
        engagedSeconds >=
          NON_VIDEO_REQUIRED_SECONDS;

      chapterEngagement = {
        required_seconds:
          NON_VIDEO_REQUIRED_SECONDS,

        engaged_seconds:
          engagedSeconds,

        remaining_seconds:
          Math.max(
            NON_VIDEO_REQUIRED_SECONDS -
              engagedSeconds,
            0,
          ),

        progress_percentage:
          percentage(
            engagedSeconds,
            NON_VIDEO_REQUIRED_SECONDS,
          ),

        is_completed:
          engagementCompleted,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | 3. LIVE CLASS REQUIREMENTS
    |--------------------------------------------------------------------------
    */

    // Sirf chapter-linked live class chapter ko block karegi.
    // Module/domain-only live class tracking chalegi,
    // lekin wo kisi specific chapter ko block nahi karegi.

    const liveClasses =
      await LiveClass.findAll({
        where: {
          chapter_id:
            chapterId,

          status: {
            [Op.ne]:
              "cancelled",
          },
        },

        order: [
          [
            "scheduled_at",
            "ASC",
          ],
        ],
      });

    const liveIds =
      liveClasses.map(
        (v) =>
          Number(v.id),
      );

    const liveRows =
      liveIds.length
        ? await StudentLiveClassProgress.findAll(
            {
              where: {
                student_id:
                  studentId,

                live_class_id:
                  {
                    [Op.in]:
                      liveIds,
                  },
              },
            },
          )
        : [];

    const liveMap =
      new Map(
        liveRows.map(
          (r) => [
            Number(
              r.live_class_id,
            ),
            r,
          ],
        ),
      );

    const liveRequirements =
      liveClasses.map(
        (liveClass) => {
          const row =
            liveMap.get(
              Number(
                liveClass.id,
              ),
            );

          const duration =
            Math.max(
              1,
              Number(
                liveClass.duration_minutes ||
                  60,
              ),
            ) * 60;

          const attended =
            Math.min(
              duration,

              Number(
                row?.attended_seconds ||
                  0,
              ),
            );

          const progress =
            percentage(
              attended,
              duration,
            );

          return {
            live_class_id:
              Number(
                liveClass.id,
              ),

            title:
              liveClass.title,

            scheduled_at:
              liveClass.scheduled_at,

            duration_seconds:
              duration,

            attended_seconds:
              attended,

            attendance_percentage:
              progress,

            is_completed:
              Boolean(
                row?.is_completed,
              ) ||
              progress >=
                LIVE_ATTENDANCE_PERCENT,
          };
        },
      );

    /*
    |--------------------------------------------------------------------------
    | 4. FINAL REQUIREMENT STATUS
    |--------------------------------------------------------------------------
    */

    const videosComplete =
      videoRequirements.every(
        (x) =>
          x.is_completed,
      );

    const liveComplete =
      liveRequirements.every(
        (x) =>
          x.is_completed,
      );

    /*
     * Agar video hai:
     * engagement automatically true.
     *
     * Agar video nahi hai:
     * 10-minute engagement required.
     */
    const engagementComplete =
      hasVideo
        ? true
        : Boolean(
            chapterEngagement
              ?.is_completed,
          );

    /*
     * FINAL:
     *
     * VIDEO chapter:
     * video + live
     *
     * NO VIDEO chapter:
     * 10 min + live
     */
    const learningRequirementsComplete =
      videosComplete &&
      engagementComplete &&
      liveComplete;

    return {
      chapter_id:
        Number(chapterId),

      video_completion_required_percentage:
        VIDEO_COMPLETION_PERCENT,

      live_attendance_required_percentage:
        LIVE_ATTENDANCE_PERCENT,

      non_video_required_seconds:
        NON_VIDEO_REQUIRED_SECONDS,

      has_video:
        hasVideo,

      videos:
        videoRequirements,

      chapter_engagement:
        chapterEngagement,

      live_classes:
        liveRequirements,

      summary: {
        total_video_resources:
          videoRequirements.length,

        completed_video_resources:
          videoRequirements.filter(
            (x) =>
              x.is_completed,
          ).length,

        total_live_classes:
          liveRequirements.length,

        completed_live_classes:
          liveRequirements.filter(
            (x) =>
              x.is_completed,
          ).length,

        videos_complete:
          videosComplete,

        engagement_complete:
          engagementComplete,

        live_classes_complete:
          liveComplete,

        learning_requirements_complete:
          learningRequirementsComplete,
      },
    };
  };

/*
|--------------------------------------------------------------------------
| FINAL COMPLETION GUARD
|--------------------------------------------------------------------------
*/

export const assertChapterLearningRequirements =
  async ({
    studentId,
    chapterId,
  }) => {
    const requirements =
      await getChapterLearningRequirements(
        {
          studentId,
          chapterId,
        },
      );

    const pending = [];

    /*
    |--------------------------------------------------------------------------
    | VIDEO
    |--------------------------------------------------------------------------
    */

    requirements.videos.forEach(
      (x) => {
        if (
          !x.is_completed
        ) {
          pending.push(
            `Watch "${x.title}" (${x.progress_percentage}% / ${VIDEO_COMPLETION_PERCENT}% required)`,
          );
        }
      },
    );

    /*
    |--------------------------------------------------------------------------
    | NO-VIDEO 10 MINUTE REQUIREMENT
    |--------------------------------------------------------------------------
    */

    if (
      requirements
        .chapter_engagement &&
      !requirements
        .chapter_engagement
        .is_completed
    ) {
      const remainingSeconds =
        requirements
          .chapter_engagement
          .remaining_seconds;

      const remainingMinutes =
        Math.ceil(
          remainingSeconds /
            60,
        );

      pending.push(
        `Spend ${remainingMinutes} more minute(s) on this chapter`,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | LIVE CLASS
    |--------------------------------------------------------------------------
    */

    requirements.live_classes.forEach(
      (x) => {
        if (
          !x.is_completed
        ) {
          pending.push(
            `Attend "${x.title}" (${x.attendance_percentage}% / ${LIVE_ATTENDANCE_PERCENT}% required)`,
          );
        }
      },
    );

    /*
    |--------------------------------------------------------------------------
    | BLOCK CHAPTER COMPLETION
    |--------------------------------------------------------------------------
    */

    if (
      pending.length
    ) {
      throw new AppError(
        `Complete learning requirements first: ${pending.join("; ")}`,
        409,
        {
          requirements,
        },
      );
    }

    return requirements;
  };