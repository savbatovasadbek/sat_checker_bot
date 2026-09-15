require("dotenv").config();
const { Bot, InlineKeyboardBuilder } = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

// ==========================================
// FILE PATHS & DIRECTORIES
// ==========================================

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(__dirname, "config", "config.json");
const KEYS_PATH = path.join(DATA_DIR, "answer_keys.json");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const USERS_PATH = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_PATH)) fs.writeFileSync(RESULTS_PATH, "[]", "utf8");
if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, "{}", "utf8");

// ==========================================
// CONFIG & ENV LOAD
// ==========================================

let config = { adminIds: [], stickers: {} };
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch (e) {
  console.error("⚠️ config.json o'qishda xatolik!");
}

let answerKeys = {};
try {
  answerKeys = JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
} catch (err) {
  console.error("❌ Answer keys faylini o'qishda xatolik:", err);
}

const BOT_TOKEN = process.env.BOT_TOKEN ? process.env.BOT_TOKEN.trim() : "";

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
console.log("👨‍🏫 Admin ID'lar:", ALL_ADMIN_IDS);
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
  const match = cleaned.match(
    /^(?:\d+[\.\)\-:]?\s*)?([A-Z0-9\/\.\-]+)[\.\)]?$/
  );
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
// COMMANDS
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
        `🤖 SAT Test tekshiruvchi botga xush kelibsiz.\n\n` +
        `Iltimos, Ism va Familiyangizni kiriting:\n` +
        `(Masalan: Asadbek Savbatov)`
    );
  }
});

async function sendHelp(ctx) {
  await ctx.reply(
    `📖 BOTDAN FOYDALANISH YO'RIQNOMASI\n\n` +
      `1️⃣ **Testni tanlash:** Bosh menyudan kerakli darsni tanlang.\n\n` +
      `2️⃣ **Javob yuborish:** Javoblaringizni botga bitta xabarda, har birini alohida qatorda yuboring.\n\n` +
      `📌 **Qabul qilinadigan formatlar:**\n` +
      ` • Variantlar: A, B, C, D\n` +
      ` • Tartib bilan: 1. A, 2) B, 3-C\n` +
      ` • Sonli (Grid-in) javoblar: 155, 7/3, -38, 210\n\n` +
      `💡 **Misol:**\n` +
      `1. A\n` +
      `2. 155\n` +
      `3. 7/3\n\n` +
      `❌ **Bekor qilish:** /cancel`
  );
}

bot.command("help", sendHelp);

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

  if (!isAdmin(userId)) {
    await ctx.reply(
      `⛔ Sizda admin huquqi yo'q.\nSizning Telegram ID: ${userId}`
    );
    return;
  }

  await ctx.reply(
    `👨‍🏫 ADMIN PANEL\n\n` +
      `/stats — Har bir test bo'yicha o'quvchilar ballari\n` +
      `/students — O'quvchilar kesimidagi natijalar\n` +
      `/checkkeys — Test kalitlari va sonini ko'rish`
  );
});

// HAR BIR TESTDA O'QUVCHILAR NATIJALARI (LESSON KESIMIDA)
bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;

  const results = getResults();
  if (results.length === 0) {
    await ctx.reply("📊 Hali natijalar mavjud emas.");
    return;
  }

  const lessonMap = {};

  results.forEach((r) => {
    const lessonTitle = r.lesson || r.lessonId;
    if (!lessonMap[lessonTitle]) {
      lessonMap[lessonTitle] = [];
    }
    lessonMap[lessonTitle].push({
      name: r.name || "Noma'lum",
      studentClass: r.studentClass || "-",
      correct: r.correct,
      total: r.total,
      percentage: r.percentage,
    });
  });

  let msg = "📊 TESTLAR BO'YICHA O'QUVCHILAR NATIJALARI\n\n";

  Object.keys(lessonMap).forEach((lessonTitle) => {
    msg += `📘 **${lessonTitle}**\n`;
    lessonMap[lessonTitle].forEach((item) => {
      msg += ` • ${item.name} (${item.studentClass})\n   └ ${item.correct} ball (${item.percentage}%)\n`;
    });
    msg += `\n`;
  });

  await ctx.reply(msg);
});

// O'QUVCHILAR KESIMIDAGI NATIJALAR
bot.command("students", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;

  const results = getResults();
  if (results.length === 0) {
    await ctx.reply("👨‍🎓 Hali natijalar mavjud emas.");
    return;
  }

  const studentMap = {};

  results.forEach((r) => {
    const key = r.telegramId;
    if (!studentMap[key]) {
      studentMap[key] = {
        name: r.name || "Noma'lum",
        studentClass: r.studentClass || "-",
        tests: [],
      };
    }
    studentMap[key].tests.push({
      lesson: r.lesson,
      correct: r.correct,
      total: r.total,
      percentage: r.percentage,
    });
  });

  let msg = "👨‍🎓 O'QUVCHILAR NATIJALARI\n\n";

  Object.values(studentMap).forEach((st, idx) => {
    msg += `${idx + 1}. **${st.name}** (${st.studentClass})\n`;
    st.tests.forEach((t, tIdx) => {
      const isLast = tIdx === st.tests.length - 1;
      const prefix = isLast ? "   └ " : "   ├ ";
      msg += `${prefix}${t.lesson}: ${t.correct}/${t.total} ball (${t.percentage}%)\n`;
    });
    msg += `\n`;
  });

  await ctx.reply(msg);
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

    if (!lesson || !lesson.answers) {
      await ctx.answerCallbackQuery({
        text: "❌ Bu test javob kalitlari hali kiritilmagan.",
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

    const expectedCount = lesson.answers.length;

    activeSessions.set(ctx.chat.id, {
      step: "testing",
      lessonId: lessonId,
      lessonTitle: lesson.title,
      expectedCount: expectedCount,
    });

    await ctx.answerCallbackQuery();

    await ctx.reply(
      `📚 ${lesson.title}\n` +
        `👤 O'quvchi: ${userData.name} (${userData.studentClass})\n\n` +
        `📝 Siz ${expectedCount} ta javob yuborishingiz kerak.\n` +
        `Har bir javobni alohida qatorda yuboring.\n\n` +
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
    await sendHelp(ctx);
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

    rawLines.forEach((line) => {
      const parsed = parseAnswerLine(line);
      if (parsed) parsedAnswers.push(parsed);
    });

    const expectedCount = session.expectedCount || 50;

    if (parsedAnswers.length !== expectedCount) {
      await ctx.reply(
        `⚠️ Javoblar soni noto'g'ri.\n` +
          `Siz yubordingiz: ${parsedAnswers.length} ta.\n` +
          `Talab qilinadi: ${expectedCount} ta.`
      );
      return;
    }

    const key = answerKeys[session.lessonId]?.answers || [];
    const results = [];
    let correct = 0;

    for (let i = 0; i < expectedCount; i++) {
      const studentAns = parsedAnswers[i];
      const correctAns = key[i];

      let isCorrect = false;
      if (Array.isArray(correctAns)) {
        isCorrect = correctAns.includes(studentAns);
      } else {
        isCorrect = studentAns === correctAns;
      }

      if (isCorrect) correct++;
      results.push({ number: i + 1, correct: isCorrect });
    }

    const wrong = expectedCount - correct;
    const percentage = Math.round((correct / expectedCount) * 100);
    const currentUser = users[userId] || {};

    let resultMessage = `📊 ${session.lessonTitle} NATIJASI\n\n`;
    resultMessage += `👤 ${currentUser.name || "O'quvchi"} (${
      currentUser.studentClass || "-"
    })\n\n`;
    resultMessage += `━━━━━━━━━━━━━━━━━━\n`;

    const correctSticker = config.stickers?.correct || "✅";
    const wrongSticker = config.stickers?.wrong || "❌";

    for (let i = 0; i < expectedCount; i++) {
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
      total: expectedCount,
      percentage: percentage,
      studentAnswers: parsedAnswers,
      date: new Date().toISOString(),
    });

    const currentLessonId = session.lessonId;
    activeSessions.delete(chatId);

    await ctx.reply(
      `🎉 Test yakunlandi!\n\n` +
        `📊 Natijangiz: ${correct}/${expectedCount} (${percentage}%)\n\n` +
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
