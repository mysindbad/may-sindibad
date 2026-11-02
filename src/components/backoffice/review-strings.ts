// Arabic copy for the report / contribution review screens (control room is
// Arabic-only; see components/backoffice/places/strings.ts).

export const reviewText = {
  by: "من",
  date: "التاريخ",
  confirmations: "تأكيدات المجتمع",
  details: "تفاصيل المساهمة",
  reporterNote: "ملاحظة المُبلِّغ",
  target: "العنصر المُبلَّغ عنه",
  targetMissing: "العنصر لم يعد موجودًا (حُذف أو أُزيل).",
  openItem: "فتح العنصر في لوحة الإدارة",
  openPlace: "فتح المكان في المحرر",
  noDetails: "لا توجد تفاصيل إضافية.",

  fieldName: "الاسم",
  fieldCity: "المدينة",
  fieldCountry: "الدولة",
  fieldDescription: "الوصف",
  fieldAddress: "العنوان",
  fieldLat: "خط العرض",
  fieldLng: "خط الطول",

  coordinatesTitle: "الموقع على الخريطة",
  coordinatesMissing: "المساهمة لا تتضمن إحداثيات. أضفها بعد التحقق من الموقع الفعلي قبل الاعتماد.",
  coordinatesFromContribution: "إحداثيات المساهمة",
  coordinatesVerified: "إحداثيات تحققت منها",
  pasteLabel: "رابط الخرائط أو الإحداثيات",
  extract: "استخراج",
  extracting: "جارٍ القراءة…",
  viewOsm: "عرض على OpenStreetMap",
  viewportWarning: "هذا الرابط يحدد مركز الخريطة فقط وقد لا يطابق موقع المكان. افتح الخريطة وتأكد قبل الاعتماد.",
  confirmCoordinates: "تحققت من الموقع على الخريطة",
  note: "ملاحظة المراجعة (اختياري)",

  approve: "اعتماد ونشر",
  reject: "رفض",
  approveNeedsCoordinates: "أضف الإحداثيات وأكّد الموقع لتفعيل الاعتماد.",
  unsupportedType: "اعتماد هذا النوع غير مدعوم بعد؛ يمكنك رفضه فقط.",
  approveWarning: "سيظهر المكان للمسافرين فور الاعتماد. أكمل الفئة والصورة لاحقًا من المحرر.",
  failed: "تعذّر تنفيذ الإجراء.",
  network: "تعذّر الاتصال بالخادم.",
} as const;

export const contributionTypeLabel: Record<string, string> = {
  new_place: "مكان جديد",
  place_correction: "تصحيح مكان",
  photo: "صورة",
  info_update: "تحديث معلومات",
};

export const reportReasonLabel: Record<string, string> = {
  spam: "محتوى دعائي",
  inaccurate: "معلومات غير دقيقة",
  offensive: "محتوى مسيء",
  duplicate: "مكرر",
  closed: "المكان مغلق",
  other: "سبب آخر",
};

export const targetTypeLabel: Record<string, string> = {
  place: "مكان",
  provider: "نشاط تجاري",
  review: "تقييم",
  contribution: "مساهمة",
  user: "مستخدم",
  community_post: "منشور مجتمع",
};

export const roleLabel: Record<string, string> = {
  traveler: "مسافر",
  provider: "مزوّد",
  admin: "مدير",
};
