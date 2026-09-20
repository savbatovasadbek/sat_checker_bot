require("dotenv").config();
const {
  Bot,
  InlineKeyboardBuilder,
  ReplyKeyboardBuilder,
} = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// ==========================================
// SUPABASE CLIENT SETUP
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL
  ? process.env.SUPABASE_URL.trim()
  : "";
const SUPABASE_KEY = process.env.SUPABASE_KEY
  ? process.env.SUPABASE_KEY.trim()
  : "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ ERROR: .env faylida SUPABASE_URL yoki SUPABASE_KEY topilmadi!"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// FILE PATHS & CONFIG LOAD
// ==========================================

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(__dirname, "config", "config.json");
const KEYS_PATH = path.join(DATA_DIR, "answer_keys.json");

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
console.log("⚡ Supabase bulutli bazasi ulangan!");
console.log("👨‍🏫 Admin ID'lar:", ALL_ADMIN_IDS);
console.log("=================================");

const activeSessions = new Map();

// ==========================================
// SUPABASE DATABASE HELPERS
// ==========================================

async function getUser(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", Number(userId))
    .maybeSingle();

  if (error) {
    console.error("User o'qishda xato:", error.message);
  }
  return data;
}

async function saveUser(userId, name, studentClass) {
  const { error } = await supabase.from("users").upsert({
    telegram_id: Number(userId),
    name: name,
    student_class: studentClass,
  });

  if (error) console.error("User saqlashda xato:", error.message);
}

async function getResults() {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Natijalarni olishda xato:", error.message);
    return [];
  }
  return data || [];
}

async function saveResult(resultData) {
  const { error } = await supabase.from("results").insert([
    {
      telegram_id: Number(resultData.telegramId),
      username: resultData.username,
      name: resultData.name,
      student_class: resultData.studentClass,
      lesson_id: resultData.lessonId,
      lesson: resultData.lesson,
      correct: resultData.correct,
      wrong: resultData.wrong,
      total: resultData.total,
      percentage: resultData.percentage,
      student_answers: resultData.studentAnswers,
    },
  ]);

  if (error) console.error("Natijani saqlashda xato:", error.message);
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

async function getSingleLessonStats(lessonIdKey) {
  const results = await getResults();
  const lessonObj = answerKeys[lessonIdKey];

  if (!lessonObj) {
    return `❌ Tizimda **${lessonIdKey}** bo'limi topilmadi.`;
  }

  const lessonTitle = lessonObj.title || lessonIdKey;

  const filteredResults = results.filter(
    (r) => r.lesson_id === lessonIdKey || r.lesson === lessonTitle
  );

  let msg = `📘 **${lessonTitle}**\n`;
  msg += ` • Topshirildi: ${filteredResults.length} marta\n\n`;

  if (filteredResults.length === 0) {
    msg += `ℹ️ Hali hech kim bu test topshirmagan.`;
    return msg;
  }

  msg += `👨‍🎓 **O'quvchilar ro'yxati:**\n`;
  filteredResults.forEach((item, idx) => {
    msg += `${idx + 1}. ${item.name || "Noma'lum"} (${
      item.student_class || "-"
    })\n`;
    msg += `   └ ${item.correct}/${item.total} ball (${item.percentage}%)\n`;
  });

  return msg;
}

// ==========================================
// KEYBOARDS
// ==========================================

// In-line menyu (xabarga yopishgan tugmalar)
function mainMenu() {
  return new InlineKeyboardBuilder()
    .text("📘 Lesson 1", "lesson:lesson1")
    .text("📗 Lesson 2", "lesson:lesson2")
    .text("📙 Lesson 3", "lesson:lesson3")
    .row()
    .text("👤 Profil / O'zgartirish", "profile")
    .text("📊 Natijalarim", "my_results")
    .row()
    .text("❓ Yordam", "help")
    .build();
}

// Reply Keyboard (Pastda doimiy ko'rinib turadigan tugmalar)
function mainReplyKeyboard() {
  return new ReplyKeyboardBuilder()
    .text("📘 Lesson 1")
    .text("📗 Lesson 2")
    .text("📙 Lesson 3")
    .row()
    .text("👤 Profil / O'zgartirish")
    .text("📊 Natijalarim")
    .row()
    .text("❓ Yordam")
    .resized()
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
// LESSON START HELPER
// ==========================================

async function startLessonProcess(ctx, lessonId) {
  const userId = ctx.from?.id;
  const lesson = answerKeys[lessonId];

  if (!lesson || !lesson.answers) {
    await ctx.reply("❌ Bu test javob kalitlari hali kiritilmagan.");
    return;
  }

  const userData = await getUser(userId);
  if (!userData || !userData.name || !userData.student_class) {
    await ctx.reply("⚠️ Avval ro'yxatdan o'ting!");
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

  await ctx.reply(
    `📚 ${lesson.title}\n` +
      `👤 O'quvchi: ${userData.name} (${userData.student_class})\n\n` +
      `📝 Siz ${expectedCount} ta javob yuborishingiz kerak.\n` +
      `Har bir javobni alohida qatorda yuboring.\n\n` +
      `❌ Bekor qilish: /cancel`
  );
}

async function sendMyResults(ctx) {
  const userId = ctx.from?.id;
  const allResults = await getResults();
  const userResults = allResults
    .filter((r) => String(r.telegram_id) === String(userId))
    .slice(-10)
    .reverse();

  if (userResults.length === 0) {
    await ctx.reply("📊 Sizda hali saqlangan natijalar yo'q.");
    return;
  }

  let msg = "📊 SO'NGGI NATIJALARINGIZ\n\n";
  userResults.forEach((r, index) => {
    msg += `${index + 1}. ${r.lesson} — ${r.correct}/${r.total} (${
      r.percentage
    }%)\n`;
  });
  await ctx.reply(msg);
}

// ==========================================
// COMMANDS
// ==========================================

bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  const existingUser = await getUser(userId);

  if (existingUser && existingUser.name && existingUser.student_class) {
    activeSessions.delete(ctx.chat.id);
    await ctx.reply(
      `👋 Xush kelibsiz, ${existingUser.name}! (${existingUser.student_class})\n\n` +
        `📚 Kerakli test bo'limini tanlang:`,
      {
        reply_markup: mainReplyKeyboard(),
      }
    );
    await ctx.reply("Inline Menyudan tanlash:", { reply_markup: mainMenu() });
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
      reply_markup: mainReplyKeyboard(),
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
      `/stats — Umumiy statistikalar (barchasi)\n` +
      `/stats1 — Lesson 1 natijalari va o'quvchilar ro'yxati\n` +
      `/stats2 — Lesson 2 natijalari va o'quvchilar ro'yxati\n` +
      `/stats3 — Lesson 3 natijalari va o'quvchilar ro'yxati\n` +
      `/students — O'quvchilar kesimidagi natijalar\n` +
      `/checkkeys — Test kalitlari va sonini ko'rish`
  );
});

bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;

  const results = await getResults();
  if (results.length === 0) {
    await ctx.reply("📊 Hali natijalar mavjud emas.");
    return;
  }

  const lessonStats = {};

  results.forEach((r) => {
    const lesson = r.lesson || r.lesson_id;
    if (!lessonStats[lesson]) {
      lessonStats[lesson] = {
        totalAttempts: 0,
        totalCorrect: 0,
        totalQuestions: 0,
      };
    }
    lessonStats[lesson].totalAttempts += 1;
    lessonStats[lesson].totalCorrect += r.correct;
    lessonStats[lesson].totalQuestions += r.total;
  });

  let msg = "📊 TESTLAR BO'YICHA STATISTIKA\n\n";

  Object.keys(lessonStats).forEach((lessonTitle) => {
    const stat = lessonStats[lessonTitle];
    const avg = ((stat.totalCorrect / stat.totalQuestions) * 100).toFixed(1);
    msg +=
      `📘 **${lessonTitle}**\n` +
      ` • Topshirildi: ${stat.totalAttempts} marta\n` +
      ` • O'rtacha natija: ${avg}%\n\n`;
  });

  await ctx.reply(msg);
});

bot.command("stats1", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const message = await getSingleLessonStats("lesson1");
  await ctx.reply(message);
});

bot.command("stats2", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const message = await getSingleLessonStats("lesson2");
  await ctx.reply(message);
});

bot.command("stats3", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const message = await getSingleLessonStats("lesson3");
  await ctx.reply(message);
});

bot.command("students", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;

  const results = await getResults();
  if (results.length === 0) {
    await ctx.reply("👨‍🎓 Hali natijalar mavjud emas.");
    return;
  }

  const studentMap = {};

  results.forEach((r) => {
    const key = r.telegram_id;
    if (!studentMap[key]) {
      studentMap[key] = {
        name: r.name || "Noma'lum",
        studentClass: r.student_class || "-",
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
// CALLBACK QUERIES (INLINE BUTTONS)
// ==========================================

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data;

  if (data === "main_menu") {
    activeSessions.delete(ctx.chat.id);
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
    await ctx.answerCallbackQuery();
    await startLessonProcess(ctx, lessonId);
    return;
  }

  if (data === "my_results") {
    await ctx.answerCallbackQuery();
    await sendMyResults(ctx);
    return;
  }

  if (data === "help") {
    await ctx.answerCallbackQuery();
    await sendHelp(ctx);
    return;
  }
});

// ==========================================
// MESSAGE PROCESSING (REPLY BUTTONS & INPUT)
// ==========================================

bot.on("message", async (ctx) => {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/")) return;

  const chatId = ctx.chat.id;
  const userId = ctx.from?.id;

  // 1. PASTKI TUGMALAR (REPLY KEYBOARD) BOSILGANDA
  if (text === "📘 Lesson 1") {
    await startLessonProcess(ctx, "lesson1");
    return;
  }
  if (text === "📗 Lesson 2") {
    await startLessonProcess(ctx, "lesson2");
    return;
  }
  if (text === "📙 Lesson 3") {
    await startLessonProcess(ctx, "lesson3");
    return;
  }
  if (text === "👤 Profil / O'zgartirish") {
    activeSessions.set(chatId, { step: "registration_name" });
    await ctx.reply("📝 Qaytadan Ism va Familiyangizni kiriting:");
    return;
  }
  if (text === "📊 Natijalarim") {
    await sendMyResults(ctx);
    return;
  }
  if (text === "❓ Yordam") {
    await sendHelp(ctx);
    return;
  }

  // 2. FOYDALANUVCHI SESSIYALARINI QAYTA ISHLASH
  const session = activeSessions.get(chatId);

  if (!session) {
    const existingUser = await getUser(userId);
    if (!existingUser) {
      activeSessions.set(chatId, { step: "registration_name" });
      await ctx.reply(
        "👋 Assalomu alaykum! Iltimos, Ism va Familiyangizni kiriting:"
      );
    } else {
      await ctx.reply("📚 Testni tanlang:", {
        reply_markup: mainReplyKeyboard(),
      });
    }
    return;
  }

  if (session.step === "registration_name") {
    activeSessions.set(chatId, {
      step: "registration_class",
      tempName: text.trim(),
    });
    await ctx.reply(`Rahmat! Endi sinfingizni kiriting (Masalan: 7-A):`);
    return;
  }

  if (session.step === "registration_class") {
    const name = session.tempName;
    const studentClass = text.trim();

    await saveUser(userId, name, studentClass);
    activeSessions.delete(chatId);

    await ctx.reply(
      `✅ Ma'lumotlaringiz saqlandi!\n\n` +
        `👤 Ism: ${name}\n` +
        `🏫 Sinf: ${studentClass}\n\n` +
        `📚 Kerakli testni tanlang:`,
      { reply_markup: mainReplyKeyboard() }
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
    const currentUser = await getUser(userId);

    let resultMessage = `📊 ${session.lessonTitle} NATIJASI\n\n`;
    resultMessage += `👤 ${currentUser?.name || "O'quvchi"} (${
      currentUser?.student_class || "-"
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

    await saveResult({
      telegramId: userId,
      username: ctx.from?.username || null,
      name: currentUser?.name || "Noma'lum",
      studentClass: currentUser?.student_class || "Noma'lum",
      lessonId: session.lessonId,
      lesson: session.lessonTitle,
      correct: correct,
      wrong: wrong,
      total: expectedCount,
      percentage: percentage,
      studentAnswers: parsedAnswers,
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

// ==========================================
// RENDER WEB SERVER & KEEP-ALIVE PING
// ==========================================

const PORT = process.env.PORT || 10000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("SAT Bot is running active 24/7!\n");
  })
  .listen(PORT, () => {
    console.log(`🚀 Web Server ${PORT}-portda ishlamoqda.`);
  });

const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

if (RENDER_EXTERNAL_URL) {
  setInterval(() => {
    https
      .get(RENDER_EXTERNAL_URL, (res) => {
        console.log(`⏰ Keep-alive ping yuborildi: Status ${res.statusCode}`);
      })
      .on("error", (err) => {
        console.error("⚠️ Keep-alive pingda xato:", err.message);
      });
  }, 10 * 60 * 1000);
}
