import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const { email, file, name } = await req.json();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "rola.al3nzi@gmail.com", // حطي ايميلك
      pass: "myhs nizt cjrv ayzm",   // كلمة مرور التطبيقات
    },
  });

  await transporter.sendMail({
    from: "your@gmail.com",
    to: email,
    subject: "شهادتك",
    text: `مرحبًا ${name}، هذه شهادتك.`,
    attachments: [
      {
        filename: `${name}.pdf`,
        content: Buffer.from(file),
      },
    ],
  });

  return Response.json({ success: true });
}