import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import coursesRoutes from "./routes/courses.routes.js";
import moduleRoutes from "./routes/module.routes.js";
import assignmentsRoutes from "./routes/assignments.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import studentCoursesRoutes from "./routes/studentCourses.routes.js";
import examRoutes from "./routes/exam.routes.js";
import studentExamRoutes from "./routes/studentExam.routes.js";




const app = express();


const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api", moduleRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentCoursesRoutes)
app.use("/api/exams", examRoutes);
app.use("/api/exam", studentExamRoutes);




app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
