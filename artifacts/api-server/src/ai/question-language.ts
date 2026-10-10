/** Lexical normalization only: never changes a quantity or invents an entity. */
export function normalizeQuestion(text:string){
 return text.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640]/g,"")
  .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي")
  .replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<="٩"?0x660:0x6f0))).toLowerCase();
}
const aliases:Record<string,string>={};
for(const [canonical,words] of Object.entries({
 scrap:"scrap scraps scarp waste wastage loss losses هدر الهدر هالك الهالك تالف التالف خسارة الخسارة نفايات النفايات سكراب السكراب خردة الخردة",
 run:"run order batch lot تشغيلة التشغيلة تشغيله التشغيله دفعة الدفعة دفعه الدفعه امر الامر طلب الطلب",
 runs:"runs orders batches lots التشغيلات تشغيلات التشغلات دفعات الدفعات اوامر الاوامر الطلبات طلبات",
 rate:"rate rates percentage percent ratio نسبة النسبة نسب معدل المعدل",
 show:"show tell give display اعرض ورجيني وريني فرجيني احكيلي قوللي قولي خبرني اظهر",
 what:"what whats شو ايش اش شنو شقد قديش اديه كام",
 which:"which اي اية ايه انهي انو",
 compare:"compare comparison versus vs قارن مقارنة قارني",
 highest:"highest biggest largest maximum max most اعلي اكثر اكبر",
 lowest:"lowest smallest minimum min least ادني اقل اصغر",
 longest:"longest اطول",shortest:"shortest اقصر",
 why:"why ليش ليه لماذا",
 cause:"cause caused causes سبب تسبب",
 changeover:"changeover chageover setup changeovers تبديل تغيير",
 mold:"mold mould القالب قالب",
 downtime:"downtime stops stop stoppage توقف التوقف توقفات التوقفات",
 minutes:"minute minutes min mins دقيقة الدقائق دقائق دقيقه دقايق بالدقائق بالدقايق",
 hours:"hour hours hr hrs ساعة ساعات ساعه بالساعات بالساعة",
 count:"count counts number عدد العدد",
 imports:"imports import الاستيرادات استيرادات الاستيراد استيراد",
 approved:"approved المعتمدة المعتمد معتمدة معتمد",
 current:"current الحالية الحالي حالي الحالية",
 status:"status الحالة حالة حالات",
 issues:"issues issue problems problem errors error مشاكل مشكلات المشكلات المشكلة مشكله مشكلة اخطاء الاخطاء",
 blocked:"blocked المحجوبة محجوبة محجوب محظورة",
 warning:"warning warnings yellow تحذيرات تحذير صفراء",
 check:"check تحقق مراجعة للمراجعة",
 time:"time duration زمن وقت مدة المدة",
 please:"please لو سمحت ممكن رجاء",
 of:"of for في علي عن عند تبع بتاع تبعت لل للامر للتشغيلة",
 and:"and و مع",
 since:"since منذ",snapshot:"snapshot لقطة اللقطة",
 changed:"changed changes تغير تغيرت التغييرات",
 is:"is are was were هو هي كان كانت بكون بتكون",
 the:"the ال",how:"how كيف",
 many:"many كم",because:"because بسبب",
 also:"also ايضا",with:"with بين",data:"data بيانات البيانات",
 measured:"measured recorded مسجل مسجلة",kilograms:"kg kilogram kilograms كغ كيلو كجم",
})){for(const word of words.split(" "))aliases[word]=canonical;}
export function canonicalWords(text:string){
 return text.replace(/[\p{L}\p{N}_-]+/gu,w=>aliases[w]??w);
}
