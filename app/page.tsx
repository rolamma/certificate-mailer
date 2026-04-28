"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

type Position = {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
};

type Recipient = {
  name: string;
  email: string;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);

  async function renderPdf(file: File) {
    const pdfjsLib = await import("pdfjs-dist");

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
    } as any).promise;
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPosition({
      x,
      y,
      xPercent: x / rect.width,
      yPercent: y / rect.height,
    });
  }

  async function createCertificatePdf(name: string) {
    if (!pdfFile || !position) {
      throw new Error("PDF أو مكان الاسم غير موجود");
    }

    const existingPdfBytes = await pdfFile.arrayBuffer();
    const fontBytes = await fetch(
      `/fonts/ArabicFont.ttf?time=${Date.now()}`
    ).then((res) => res.arrayBuffer());

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    pdfDoc.registerFontkit(fontkit);

    const customFont = await pdfDoc.embedFont(fontBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const pdfX = position.xPercent * width;
    const pdfY = height - position.yPercent * height;

    page.drawText(name, {
      x: pdfX,
      y: pdfY,
      size: 24,
      font: customFont,
      color: rgb(0, 0, 0),
    });

    return await pdfDoc.save();
  }

  async function generateCertificates() {
    if (!pdfFile || !position || recipients.length === 0) {
      alert("ارفعي PDF وExcel وحددي مكان الاسم");
      return;
    }

    for (const person of recipients) {
      const pdfBytes = await createCertificatePdf(person.name);

      const blob = new Blob([new Uint8Array(pdfBytes)], {
        type: "application/pdf",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${person.name}.pdf`;
      a.click();
    }
  }

  async function sendEmails() {
    if (!pdfFile || !position || recipients.length === 0) {
      alert("ارفعي PDF وExcel وحددي مكان الاسم");
      return;
    }

    setSending(true);

    try {
      for (const person of recipients) {
        const pdfBytes = await createCertificatePdf(person.name);

        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: person.email,
            name: person.name,
            file: Array.from(pdfBytes),
          }),
        });

        if (!res.ok) {
          throw new Error(`فشل إرسال شهادة ${person.name}`);
        }
      }

      alert("تم إرسال الشهادات بالإيميل ✅");
    } catch (error) {
      alert("صار خطأ أثناء الإرسال");
      console.error(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 sm:p-8" dir="rtl">
      <div className="w-full max-w-5xl mx-auto bg-white p-4 sm:p-6 rounded-xl shadow">
        <h1 className="text-xl sm:text-2xl font-bold mb-4">
          نظام إصدار الشهادات
        </h1>

        <p className="mb-4 text-sm sm:text-base text-gray-700">
          ارفعي القالب، ثم اضغطي على مكان الاسم.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="font-bold">رفع قالب الشهادة PDF:</p>
            <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer inline-block mt-2">
              اختر ملف PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];

                  if (file) {
                    setPdfFile(file);
                    setPosition(null);

                    setTimeout(async () => {
                      await renderPdf(file);
                    }, 100);
                  }
                }}
              />
            </label>
          </div>

          <div>
            <p className="font-bold">رفع ملف الأسماء Excel:</p>
            <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer inline-block mt-2">
              اختر ملف Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];

                  if (file) {
                    const reader = new FileReader();

                    reader.onload = (evt) => {
                      const data = new Uint8Array(
                        evt.target?.result as ArrayBuffer
                      );
                      const workbook = XLSX.read(data, { type: "array" });

                      const sheet = workbook.Sheets[workbook.SheetNames[0]];
                      const json = XLSX.utils.sheet_to_json<any>(sheet);

                      const extractedRecipients = json
                        .map((row) => ({
                          name: String(row.name || "").trim(),
                          email: String(row.email || "").trim(),
                        }))
                        .filter((row) => row.name !== "" && row.email !== "");

                      setRecipients(extractedRecipients);
                    };

                    reader.readAsArrayBuffer(file);
                  }
                }}
              />
            </label>
          </div>
        </div>

        {recipients.length > 0 && (
          <div className="mt-4 bg-gray-100 p-4 rounded text-sm sm:text-base">
            <h2 className="font-bold mb-2">البيانات من الإكسل:</h2>
            {recipients.map((person, index) => (
              <p key={index}>
                {person.name} - {person.email}
              </p>
            ))}
          </div>
        )}

        {pdfFile && (
          <div className="mt-6 overflow-x-auto">
            <div className="relative inline-block border bg-white">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="cursor-crosshair max-w-full h-auto"
              />

              {position && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
                  style={{ left: position.x, top: position.y }}
                >
                  <div className="w-4 h-4 bg-red-600 rounded-full mx-auto"></div>
                  <p className="text-red-600 font-bold whitespace-nowrap text-sm">
                    هنا الاسم
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {position && (
          <div className="mt-4 bg-gray-100 p-4 rounded text-sm sm:text-base">
            تم تحديد مكان الاسم ✅
          </div>
        )}

        {recipients.length > 0 && position && (
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={generateCertificates}
              className="w-full sm:w-auto bg-green-600 text-white px-4 py-3 sm:py-2 rounded font-bold"
            >
              تحميل الشهادات
            </button>

            <button
              onClick={sendEmails}
              disabled={sending}
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded font-bold disabled:bg-gray-400"
            >
              {sending ? "جاري الإرسال..." : "إرسال الشهادات بالإيميل"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}