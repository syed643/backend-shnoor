import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const generatePDF = (
  resOrExamName,
  examName,
  score,
  userId,
  percentage = null,
  studentName = null
) => {
  const hasResponse =
    resOrExamName && typeof resOrExamName.setHeader === "function";

  const res = hasResponse ? resOrExamName : null;
  const exam_name = hasResponse ? examName : resOrExamName;
  const scoreValue = hasResponse ? score : examName;
  const user_id = hasResponse ? userId : score;
  const percentageValue = hasResponse ? percentage : userId;
  const student_name = hasResponse ? studentName : percentage;

  const numericScore = Number(scoreValue);
  const numericPercentage =
    percentageValue !== null && percentageValue !== undefined
      ? Number(percentageValue)
      : null;

  if (
    isNaN(numericScore) &&
    (numericPercentage === null || isNaN(numericPercentage))
  ) {
    if (res) {
      return res.status(400).json({
        success: false,
        message: "Invalid score"
      });
    }

    return { generated: false, message: "Invalid score" };
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 72, bottom: 72, left: 72, right: 72 }
  });

  let outputStream = null;
  let filePath = null;

  if (res) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=certificate_${user_id}.pdf`
    );
    outputStream = res;
  } else {
    const certDir = path.join(process.cwd(), "certificates");
    fs.mkdirSync(certDir, { recursive: true });
    const fileName = `certificate_${user_id}_${Date.now()}.pdf`;
    filePath = path.join(certDir, fileName);
    outputStream = fs.createWriteStream(filePath);
  }

  doc.pipe(outputStream);


  // Border
  doc
    .lineWidth(3)
    .strokeColor("#b28a2e")
    .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
    .stroke();

  // Title
  doc.moveDown(3);
  doc.font("Times-Bold").fontSize(34).text(
    "CERTIFICATE OF COMPLETION",
    { align: "center" }
  );

  doc.moveDown(2);

  // Body
  doc.font("Times-Roman").fontSize(24).text(
    "This is proudly presented to",
    { align: "center" }
  );

  doc.moveDown(1);
  doc.font("Times-Bold").fontSize(26).text(
    student_name || `Student ID: ${user_id}`,
    { align: "center", underline: true }
  );

  doc.moveDown(1);
  doc.font("Times-Roman").fontSize(23).text(
    `For successfully completing the exam "${exam_name}"`,
    { align: "center" }
  );

  doc.moveDown(1);
  doc.font("Times-Bold").fontSize(22).text(
    `Score Achieved: ${numericScore}`,
    { align: "center" }
  );

  if (numericPercentage !== null) {
    doc.moveDown(0.5);
    doc.font("Times-Roman").fontSize(20).text(
      `Percentage: ${numericPercentage}%`,
      { align: "center" }
    );
  }

  // Footer
  doc.moveDown(4);
  doc.fontSize(12);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 80, 720);
  doc.text("Authorized Signature", 400, 720);
  doc.moveTo(380, 710).lineTo(540, 710).stroke();

  doc.end();

  if (res) {
    return { generated: true };
  }

  return new Promise((resolve, reject) => {
    outputStream.on("finish", () =>
      resolve({ generated: true, filePath })
    );
    outputStream.on("error", (err) => reject(err));
    doc.on("error", (err) => reject(err));
  });
};

export default generatePDF;
