import { Certificate, Student } from "../models/index.js"; 
import { asyncHandler } from "../utils/asyncHandler.js"; 
import { AppError, ok } from "../utils/response.js";
import {
  LateFineSetting,
} from "../models/index.js";
export const verifyCertificate=asyncHandler(async(req,res)=>{const cert=await Certificate.findOne({where:{certificate_number:req.params.number},include:[{model:Student,required:false}]}).catch(()=>Certificate.findOne({where:{certificate_number:req.params.number}}));if(!cert)throw new AppError("Certificate not found",404);ok(res,cert,"Certificate verified");});
export const getPublicLateFineInfo =
  asyncHandler(async (req, res) => {
    const setting =
      await LateFineSetting.findOne({
        where: { is_active: true },
        order: [["id", "DESC"]],
      });

    if (!setting) {
      return ok(
        res,
        {
          late_fine_amount: 0,
          start_date: null,
          is_late: false,
        },
        "Late fine is not configured",
      );
    }

    const fineAmount = Number(
      setting.late_fine_amount || 0,
    );

    const todayStr = new Date()
      .toISOString()
      .slice(0, 10);

    const startDateStr = String(
      setting.start_date,
    ).slice(0, 10);

    const isLate =
      fineAmount > 0 &&
      todayStr > startDateStr;

    return ok(
      res,
      {
        late_fine_amount: fineAmount,
        start_date: startDateStr,
        is_late: isLate,
      },
      "Late fine info retrieved",
    );
  });