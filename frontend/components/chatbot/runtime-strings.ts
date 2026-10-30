export type RuntimeStrings = {
  typeAnswer: string;
  skip: string;
  skipped: string;
  conversationComplete: string;
  yourAnswer: string;
  restart: string;
  starting: string;
  typing: string;
  continue_: string;
  searchOptions: string;
  chooseOption: string;
  chooseFile: string;
  chooseFiles: string;
  fileHint: string;
  pay: string;
  loadingTimes: string;
  verificationCode: string;
  codePlaceholder: string;
  previewCode: string;
  checkPhone: string;
  verifyContinue: string;
  changePhone: string;
  phoneNumber: string;
  phonePlaceholder: string;
  sendCode: string;
  sendAnswer: string;
  couldNotStart: string;
  couldNotSubmit: string;
  loadingPreview: string;
  previewUnavailable: string;
  previousMonth: string;
  nextMonth: string;
  today: string;
  pickDate: string;
};

const en: RuntimeStrings = {
  typeAnswer: "Type your answer…",
  skip: "Skip",
  skipped: "Skipped",
  conversationComplete: "Conversation complete",
  yourAnswer: "Your answer",
  restart: "Restart",
  starting: "Starting conversation…",
  typing: "Chatbot is typing",
  continue_: "Continue",
  searchOptions: "Search options…",
  chooseOption: "Choose option",
  chooseFile: "Choose a file",
  chooseFiles: "Choose files",
  fileHint: "Files are size checked, scanned, and stored behind signed downloads.",
  pay: "Pay",
  loadingTimes: "Loading available times…",
  verificationCode: "Verification code",
  codePlaceholder: "6-digit code",
  previewCode: "Preview code:",
  checkPhone: "Check your phone for the code.",
  verifyContinue: "Verify and continue",
  changePhone: "Change phone",
  phoneNumber: "Phone number",
  phonePlaceholder: "+971…",
  sendCode: "Send verification code",
  sendAnswer: "Send answer",
  couldNotStart: "Could not start conversation",
  couldNotSubmit: "Could not submit answer",
  loadingPreview: "Loading preview…",
  previewUnavailable: "Preview unavailable",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  today: "Today",
  pickDate: "Select a date",
};

const ar: RuntimeStrings = {
  typeAnswer: "اكتب إجابتك…",
  skip: "تخطّي",
  skipped: "تم التخطي",
  conversationComplete: "انتهت المحادثة",
  yourAnswer: "إجابتك",
  restart: "إعادة البدء",
  starting: "جارٍ بدء المحادثة…",
  typing: "المساعد يكتب",
  continue_: "متابعة",
  searchOptions: "ابحث في الخيارات…",
  chooseOption: "اختر خيارًا",
  chooseFile: "اختر ملفًا",
  chooseFiles: "اختر الملفات",
  fileHint: "يتم التحقق من حجم الملفات وفحصها وتخزينها خلف روابط تنزيل موقّعة.",
  pay: "ادفع",
  loadingTimes: "جارٍ تحميل المواعيد المتاحة…",
  verificationCode: "رمز التحقق",
  codePlaceholder: "رمز من 6 أرقام",
  previewCode: "رمز المعاينة:",
  checkPhone: "تحقق من هاتفك للحصول على الرمز.",
  verifyContinue: "تحقق ومتابعة",
  changePhone: "تغيير الرقم",
  phoneNumber: "رقم الهاتف",
  phonePlaceholder: "+966…",
  sendCode: "إرسال رمز التحقق",
  sendAnswer: "إرسال الإجابة",
  couldNotStart: "تعذّر بدء المحادثة",
  couldNotSubmit: "تعذّر إرسال الإجابة",
  loadingPreview: "جارٍ تحميل المعاينة…",
  previewUnavailable: "المعاينة غير متاحة",
  previousMonth: "الشهر السابق",
  nextMonth: "الشهر التالي",
  today: "اليوم",
  pickDate: "اختر تاريخًا",
};

const catalogs: Record<string, RuntimeStrings> = { en, ar };

/** UI chrome strings for the visitor chat, chosen from the conversation's current locale. */
export function getRuntimeStrings(locale: string | undefined): RuntimeStrings {
  const primary = (locale || "en").toLowerCase().split(/[-_]/)[0];
  return catalogs[primary] ?? en;
}
