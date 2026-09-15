require("dotenv").config();
const { Bot, InlineKeyboardBuilder } = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

// ==========================================
// FILE PATHS & DIRECTORIES
// ==========================================

const DATA_DIR = path.join(__dirname, "data");
const EXPORTS_DIR = path.join(__dirname, "exports");
const CONFIG_PATH = path.join(__dirname, "config", "config.json");
const KEYS_PATH = path.join(DATA_DIR, "answer_keys.json");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const USERS_PATH = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_PATH)) fs.writeFileSync(RESULTS_PATH, "[]", "utf8");
if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, "{}", "utf8");

// ==========================================
// CONFIG & ENV LOAD
// ==========================================

let config = { adminIds: [], stickers: {} };
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch (e) {
  console.error("⚠️ config.json yuklanishida xato!");
}

let answerKeys = {};
try {
  answerKeys = JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
} catch (err) {
  console.error("❌ Answer keys faylini o'qishda xatolik:", err);
}

const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";

// Admin ID'larni ham .env'dan, ham config.json'dan jamlaymiz
const envAdminIds = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map((id) => String(id.trim()))
  : [];
const configAdminIds = (config.adminIds || []).map((id) => String(id));

const ALL_ADMIN_IDS = Array.from(new Set([...envAdminIds, ...configAdminIds]));

if (!BOT_TOKEN) {
  console.error("❌ ERROR: .env faylida BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

console.log("=================================");
console.log("🤖 TEST BOT ISHGA TUSHMOQDA...");
console.log("👨‍🏫 Baza bo'yicha Admin ID'lar:", ALL_ADMIN_IDS);
console.log("=================================");

const activeSessions = new Map();

// ==========================================
// STORAGE HELPERS
// ==========================================

function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveUser(userId, userData) {
  const users = getUsers();
  users[userId] = userData;
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf8");
}

function getResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveResult(result) {
  const results = getResults();
  results.push(result);
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");
}

function isAdmin(userId) {
  if (!userId) return false;
  return ALL_ADMIN_IDS.includes(String(userId).trim());
}

function parseAnswerLine(line) {
  const cleaned = line.trim().toUpperCase();
  if (!cleaned) return null;
  const match = cleaned.match(/^(?:\d+[\.\)\-:]?\s*)?([A-D])[\.\)]?$/);
  return match ? match[1] : null;
}

// ==========================================
// KEYBOARDS
// ==========================================

function mainMenu() {
  return new InlineKeyboardBuilder()
    .text("📘 Lesson 1", "lesson:lesson1")
    .text("📗 Lesson 2", "lesson:lesson2")
    .row()
    .text("📙 Lesson 3", "lesson:lesson3")
    .text("📕 Lesson 4", "lesson:lesson4")
    .row()
    .text("📒 Lesson 5", "lesson:lesson5")
    .text("📓 Lesson 6", "lesson:lesson6")
    .row()
    .text("👤 Profil / O'zgartirish", "profile")
    .text("📊 Natijalarim", "my_results")
    .row()
    .text("❓ Yordam", "help")
    .build();
}

function postResultKeyboard(lessonId) {
  return new InlineKeyboardBuilder()
    .text("🔄 Shu testni qayta ishlash", `lesson:${lessonId}`)
    .row()
    .text("📚 Boshqa test tanlash", "main_menu")
    .build();
}

// ==========================================
// START & REGISTRATION
// ==========================================

bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  const users = getUsers();
  const existingUser = users[userId];

  if (existingUser && existingUser.name && existingUser.studentClass) {
    activeSessions.delete(ctx.chat.id);
    await ctx.reply(
      `👋 Xush kelibsiz, ${existingUser.name}! (${existingUser.studentClass})\n\n` +
        `📚 Kerakli test bo'limini tanlang:`,
      { reply_markup: mainMenu() }
    );
  } else {
    activeSessions.set(ctx.chat.id, { step: "registration_name" });
    await ctx.reply(
      `👋 Assalomu alaykum!\n\n` +
        `🤖 Test tekshiruvchi botga xush kelibsiz.\n\n` +
        `Iltimos, Ism va Familiyangizni kiriting:\n` +
        `(Masalan: Asadbek Savbatov)`
    );
  }
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `❓ TEST TOPSHIRISH BO'YICHA YORDAM\n\n` +
      `1️⃣ Lessonni tanlang va 50 ta javobni yuboring.\n` +
      `2️⃣ Qabul qilinadigan formatlar:\n` +
      `   • A\n   • A)\n   • A.\n   • 1. A\n   • 1) A\n   • 1-A\n   • 1:A\n   • 1 A\n\n` +
      `❌ Bekor qilish: /cancel`
  );
});

bot.command("cancel", async (ctx) => {
  if (activeSessions.has(ctx.chat.id)) {
    activeSessions.delete(ctx.chat.id);
    await ctx.reply("❌ Amal bekor qilindi. Bosh menu:", {
      reply_markup: mainMenu(),
    });
  } else {
    await ctx.reply("ℹ️ Hozirda faol test seansi yo'q.");
  }
});

// ==========================================
// ADMIN COMMANDS
// ==========================================

bot.command("admin", async (ctx) => {
  const userId = ctx.from?.id;
  console.log(`[LOG] /admin buyrug'i keldi. User ID: ${userId}`);

  if (!isAdmin(userId)) {
    await ctx.reply(
      `⛔ Sizda admin huquqi yo'q.\nSizning Telegram ID: ${userId}`
    );
    return;
  }

  await ctx.reply(
    `👨‍🏫 ADMIN PANEL\n\n` +
      `/stats — umumiy statistika\n` +
      `/students — oxirgi natijalar\n` +
      `/excel — Excel yuklab olish\n` +
      `/checkkeys — test kalitlari`
  );
});

bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply(`⛔ Sizda admin huquqi yo'q. Sizning ID: ${ctx.from?.id}`);
    return;
  }

  const results = getResults();
  if (results.length === 0) {
    await ctx.reply("📊 Hali natijalar mavjud emas.");
    return;
  }

  const totalTests = results.length;
  const totalCorrect = results.reduce((sum, item) => sum + item.correct, 0);
  const average = (totalCorrect / (totalTests * 50)) * 100;

  await ctx.reply(
    `📊 UMUMIY STATISTIKA\n\n` +
      `📝 Topshirilgan testlar soni: ${totalTests}\n` +
      `📈 O'rtacha o'zlashtirish: ${average.toFixed(1)}%`
  );
});

bot.command("students", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply(`⛔ Sizda admin huquqi yo'q.`);
    return;
  }

  const results = getResults();
  const lastResults = results.slice(-10).reverse();

  if (lastResults.length === 0) {
    await ctx.reply("Hali natijalar mavjud emas.");
    return;
  }

  let message = "👨‍🎓 OXIRGI 10 TA NATIJA\n\n";
  lastResults.forEach((r, index) => {
    message +=
      `${index + 1}. ${r.name} (${r.studentClass || "Noma'lum"})\n` +
      `📚 ${r.lesson}\n` +
      `📊 ${r.correct}/50 (${r.percentage}%)\n\n`;
  });

  await ctx.reply(message);
});

bot.command("checkkeys", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  let msg = "🔍 MAVJUD TEST KALITLARI:\n\n";
  Object.keys(answerKeys).forEach((key) => {
    const lesson = answerKeys[key];
    msg += `• ${key}: ${lesson.title} (${
      lesson.answers?.length || 0
    } ta kalit)\n`;
  });
  await ctx.reply(msg);
});

bot.command("excel", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;

  const results = getResults();
  if (results.length === 0) {
    await ctx.reply("📊 Eksport qilish uchun natijalar yo'q.");
    return;
  }

  await ctx.reply("⏳ Excel fayli shakllantirilmoqda...");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Natijalar");

  const columns = [
    { header: "№", key: "index", width: 5 },
    { header: "Ism Familiya", key: "name", width: 25 },
    { header: "Sinf", key: "studentClass", width: 10 },
    { header: "Telegram ID", key: "telegramId", width: 15 },
    { header: "Lesson", key: "lesson", width: 15 },
    { header: "To'g'ri", key: "correct", width: 10 },
    { header: "Noto'g'ri", key: "wrong", width: 10 },
    { header: "Foiz (%)", key: "percentage", width: 10 },
    { header: "Sana", key: "date", width: 20 },
  ];

  for (let i = 1; i <= 50; i++) {
    columns.push({ header: `S${i}`, key: `q_${i}`, width: 5 });
  }

  worksheet.columns = columns;

  results.forEach((res, index) => {
    const rowData = {
      index: index + 1,
      name: res.name || "-",
      studentClass: res.studentClass || "-",
      telegramId: res.telegramId,
      lesson: res.lesson,
      correct: res.correct,
      wrong: res.wrong,
      percentage: `${res.percentage}%`,
      date: res.date ? new Date(res.date).toLocaleString("uz-UZ") : "-",
    };

    if (res.studentAnswers && Array.isArray(res.studentAnswers)) {
      res.studentAnswers.forEach((ans, qIndex) => {
        rowData[`q_${qIndex + 1}`] = ans;
      });
    }

    worksheet.addRow(rowData);
  });

  const filePath = path.join(EXPORTS_DIR, `Natijalar_${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(filePath);

  await bot.sendDocument(
    ctx.chat.id,
    filePath,
    {},
    {
      filename: "Test_Natijalari.xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  );
});

// ==========================================
// CALLBACK QUERIES
// ==========================================

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;
  const users = getUsers();

  if (data === "main_menu") {
    await ctx.answerCallbackQuery();
    await ctx.reply("📚 Kerakli testni tanlang:", { reply_markup: mainMenu() });
    return;
  }

  if (data === "profile") {
    await ctx.answerCallbackQuery();
    activeSessions.set(ctx.chat.id, { step: "registration_name" });
    await ctx.reply("📝 Qaytadan Ism va Familiyangizni kiriting:");
    return;
  }

  if (data?.startsWith("lesson:")) {
    const lessonId = data.split(":")[1];
    const lesson = answerKeys[lessonId];

    if (!lesson) {
      await ctx.answerCallbackQuery({
        text: "❌ Bu test mavjud emas.",
        show_alert: true,
      });
      return;
    }

    const userData = users[userId];
    if (!userData || !userData.name || !userData.studentClass) {
      await ctx.answerCallbackQuery({
        text: "⚠️ Avval ro'yxatdan o'ting!",
        show_alert: true,
      });
      activeSessions.set(ctx.chat.id, { step: "registration_name" });
      await ctx.reply("Ismingizni kiriting:");
      return;
    }

    activeSessions.set(ctx.chat.id, {
      step: "testing",
      lessonId: lessonId,
      lessonTitle: lesson.title,
    });

    await ctx.answerCallbackQuery();

    await ctx.reply(
      `📚 ${lesson.title}\n` +
        `👤 O'quvchi: ${userData.name} (${userData.studentClass})\n\n` +
        `📝 50 ta javobni yuboring.\n` +
        `Qabul qilinadigan formatlar: A, A), 1. A, 1-A va h.k.\n\n` +
        `❌ Bekor qilish: /cancel`
    );
    return;
  }

  if (data === "my_results") {
    await ctx.answerCallbackQuery();
    const results = getResults()
      .filter((r) => r.telegramId === userId)
      .slice(-10)
      .reverse();

    if (results.length === 0) {
      await ctx.reply("📊 Sizda hali saqlangan natijalar yo'q.");
      return;
    }

    let msg = "📊 SO'NGGI NATIJALARINGIZ\n\n";
    results.forEach((r, index) => {
      msg += `${index + 1}. ${r.lesson} — ${r.correct}/${r.total} (${
        r.percentage
      }%)\n`;
    });
    await ctx.reply(msg);
    return;
  }

  if (data === "help") {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `❓ YORDAM\n\nTestni tanlang va 50 ta javobni yuboring.\n` +
        `Format namunasi:\n1. A\n2. B\n3. C...`
    );
    return;
  }
});

// ==========================================
// MESSAGE PROCESSING
// ==========================================

bot.on("message", async (ctx) => {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/")) return;

  const chatId = ctx.chat.id;
  const userId = ctx.from?.id;
  const session = activeSessions.get(chatId);
  const users = getUsers();

  if (!session) {
    if (!users[userId]) {
      await ctx.reply("📚 Avval /start bosing va ro'yxatdan o'ting.");
    } else {
      await ctx.reply("📚 Testni tanlang:", { reply_markup: mainMenu() });
    }
    return;
  }

  if (session.step === "registration_name") {
    saveUser(userId, { ...(users[userId] || {}), name: text.trim() });
    activeSessions.set(chatId, { step: "registration_class" });
    await ctx.reply(`Rahmat! Endi sinfingizni kiriting (Masalan: 7-A):`);
    return;
  }

  if (session.step === "registration_class") {
    const userObj = users[userId] || {};
    userObj.studentClass = text.trim();
    saveUser(userId, userObj);

    activeSessions.delete(chatId);
    await ctx.reply(
      `✅ Ma'lumotlaringiz saqlandi!\n\n` +
        `👤 Ism: ${userObj.name}\n` +
        `🏫 Sinf: ${userObj.studentClass}\n\n` +
        `📚 Kerakli testni tanlang:`,
      { reply_markup: mainMenu() }
    );
    return;
  }

  if (session.step === "testing") {
    const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const parsedAnswers = [];
    const invalidLines = [];

    rawLines.forEach((line, index) => {
      const parsed = parseAnswerLine(line);
      if (parsed) {
        parsedAnswers.push(parsed);
      } else {
        invalidLines.push(index + 1);
      }
    });

    if (invalidLines.length > 0) {
      await ctx.reply(
        `⚠️ Noto'g'ri formatdagi javoblar aniqlandi (Qatorlar: ${invalidLines.join(
          ", "
        )}).\n` + `Faqat A, B, C, D variantlaridan foydalaning.`
      );
      return;
    }

    if (parsedAnswers.length !== 50) {
      await ctx.reply(
        `⚠️ Javoblar soni noto'g'ri.\n` +
          `Siz yubordingiz: ${parsedAnswers.length} ta.\n` +
          `Talab qilinadi: 50 ta.`
      );
      return;
    }

    const key = answerKeys[session.lessonId]?.answers || [];
    const results = [];
    let correct = 0;

    for (let i = 0; i < 50; i++) {
      const studentAns = parsedAnswers[i];
      const correctAns = key[i];
      const isCorrect = studentAns === correctAns;

      if (isCorrect) correct++;
      results.push({ number: i + 1, correct: isCorrect });
    }

    const wrong = 50 - correct;
    const percentage = Math.round((correct / 50) * 100);
    const currentUser = users[userId] || {};

    let resultMessage = `📊 ${session.lessonTitle} NATIJASI\n\n`;
    resultMessage += `👤 ${currentUser.name || "O'quvchi"} (${
      currentUser.studentClass || "-"
    })\n\n`;
    resultMessage += `━━━━━━━━━━━━━━━━━━\n`;

    const correctSticker = config.stickers?.correct || "✅";
    const wrongSticker = config.stickers?.wrong || "❌";

    for (let i = 0; i < 50; i++) {
      resultMessage += `${String(i + 1).padStart(2, "0")}. ${
        results[i].correct ? correctSticker : wrongSticker
      }   `;
      if ((i + 1) % 5 === 0) resultMessage += "\n";
    }

    resultMessage += `\n━━━━━━━━━━━━━━━━━━\n\n`;
    resultMessage += `✅ To'g'ri: ${correct}\n`;
    resultMessage += `❌ Noto'g'ri: ${wrong}\n`;
    resultMessage += `📊 Natija: ${percentage}%\n\n`;
    resultMessage += `🔒 Noto'g'ri javoblar ko'rsatilmadi.`;

    await ctx.reply(resultMessage);

    saveResult({
      telegramId: userId,
      username: ctx.from?.username || null,
      name: currentUser.name || "Noma'lum",
      studentClass: currentUser.studentClass || "Noma'lum",
      lessonId: session.lessonId,
      lesson: session.lessonTitle,
      correct: correct,
      wrong: wrong,
      total: 50,
      percentage: percentage,
      studentAnswers: parsedAnswers,
      date: new Date().toISOString(),
    });

    const currentLessonId = session.lessonId;
    activeSessions.delete(chatId);

    await ctx.reply(
      `🎉 Test yakunlandi!\n\n` +
        `📊 Natijangiz: ${correct}/50 (${percentage}%)\n\n` +
        `Keyingi harakatni tanlang:`,
      { reply_markup: postResultKeyboard(currentLessonId) }
    );
  }
});

// ==========================================
// START POLLING
// ==========================================

bot.catch((err) => console.error("❌ BOT ERROR:", err));

bot
  .startPolling()
  .then(() => console.log("✅ Bot muvaffaqiyatli ishga tushdi!"))
  .catch((err) => console.error("❌ Polling xatosi:", err));
