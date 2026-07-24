import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import sequelize from "./config/database.js";
import "./models/index.js";
const port=Number(process.env.PORT||5000);
try{await sequelize.authenticate();
console.log("MySQL connected");
app.listen(port,()=>console.log(`RKNexora API running on port ${port}`));}
catch(e){console.error("Startup failed",e);process.exit(1);}
