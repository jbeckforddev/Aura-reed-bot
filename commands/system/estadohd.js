import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { setDownloadCacheEnv } from "../../controllers/downloadUtils.js";
import { fytBold } from "../../models/TextStyle.js";

const tmp = setDownloadCacheEnv();
const execAsync = promisify(exec);

if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

export default {
  name: ["estadohd", "eshd", "hd"],
  category: "system",
  description: "Convierte un documento a video/imagen HD para estados.",

  execute: async (socket, message, args) => {
    const remoteJid = message.key.remoteJid;
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.documentMessage) {
      return await socket.sendMessage(
        remoteJid,
        { text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA ARCHIVO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde a un archivo en modo\n┃ > documento (Video o Imagen).\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣` },
        { quoted: message }
      );
    }

    const docMsg = quoted.documentMessage;
    const mime = docMsg.mimetype || "";
    const isVideo = mime.includes("video");
    const isImage = mime.includes("image");

    if (!isVideo && !isImage) {
      return await socket.sendMessage(
        remoteJid,
        { text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FORMATO INVÁLIDO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > El documento debe ser un video\n┃ > o una imagen.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣` },
        { quoted: message }
      );
    }

    await socket.sendMessage(remoteJid, { react: { text: "⏳", key: message.key } });

    const id = crypto.randomBytes(8).toString("hex");
    const ext = isVideo ? ".mp4" : ".jpg";
    const inputP = path.join(tmp, `hd_${id}_in${ext}`);
    const outputP = path.join(tmp, `hd_${id}_out${ext}`);

    try {
      const stream = await downloadContentFromMessage(docMsg, "document");
      const writer = fs.createWriteStream(inputP);
      
      for await (const chunk of stream) {
        writer.write(chunk);
      }
      writer.end();

      let finalPath = inputP;

      if (isVideo) {
        const sizeMB = fs.statSync(inputP).size / (1024 * 1024);
        
        try {
          if (sizeMB > 60) {
            await socket.sendMessage(remoteJid, { react: { text: "🗜️", key: message.key } });
            await execAsync(
              `ffmpeg -y -i "${finalPath}" -c:v libx264 -crf 26 -preset fast -c:a aac -b:a 128k -movflags +faststart -threads 0 "${outputP}"`,
              { maxBuffer: 1024 * 1024 * 50 }
            );
            finalPath = outputP;
          } else {
            const { stdout: codecInfo } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`);
            const codec = codecInfo.trim().toLowerCase();

            if (codec === "h264") {
              await execAsync(
                `ffmpeg -y -i "${finalPath}" -c copy -movflags +faststart -threads 0 "${outputP}"`,
                { maxBuffer: 1024 * 1024 * 50 }
              );
            } else {
              await execAsync(
                `ffmpeg -y -i "${finalPath}" -c:v libx264 -preset fast -c:a aac -b:a 128k -movflags +faststart -threads 0 "${outputP}"`,
                { maxBuffer: 1024 * 1024 * 50 }
              );
            }
            finalPath = outputP;
          }
        } catch (e) {
          finalPath = inputP;
        }
      } else if (isImage) {
        try {
           await execAsync(`ffmpeg -y -i "${finalPath}" -q:v 2 "${outputP}"`);
           finalPath = outputP;
        } catch (e) {
           finalPath = inputP;
        }
      }

      if (isVideo) {
        await socket.sendMessage(remoteJid, {
          video: fs.readFileSync(finalPath),
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Video optimizado\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "video/mp4"
        }, { quoted: message });
      } else {
        await socket.sendMessage(remoteJid, {
          image: fs.readFileSync(finalPath),
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Imagen optimizada\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "image/jpeg"
        }, { quoted: message });
      }

      await socket.sendMessage(remoteJid, { react: { text: "✅", key: message.key } });

    } catch (error) {
      await socket.sendMessage(remoteJid, { react: { text: "❌", key: message.key } });
      const errorMsg = error.message || "Ocurrió un error inesperado.";
      await socket.sendMessage(
        remoteJid,
        { text: `╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR REAL")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${errorMsg}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣` },
        { quoted: message }
      );
    } finally {
      try { if (fs.existsSync(inputP)) fs.unlinkSync(inputP); } catch {}
      try { if (fs.existsSync(outputP)) fs.unlinkSync(outputP); } catch {}
    }
  }
};

