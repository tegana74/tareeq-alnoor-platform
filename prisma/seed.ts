import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("بدء التهيئة...")

  // ===== المستخدمون =====
  const adminPassword = await bcrypt.hash("@#hussian74", 10)

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { phone: "01116544383", password: adminPassword },
      })
    : await prisma.user.create({
        data: {
          phone: "01116544383",
          password: adminPassword,
          firstName: "مدير",
          middleName: "",
          lastName: "المنصة",
          role: "ADMIN",
          email: "admin@tareeqelnoor.com",
        },
      })
  console.log("أدمن:", admin.phone)

  // ===== السنوات =====
  const years = [
    { name: "الصف الأول الثانوي", order: 1 },
    { name: "الصف الثاني الثانوي", order: 2 },
    { name: "الصف الثالث الثانوي", order: 3 },
  ]
  const yearRecords: Record<string, string> = {}
  for (const y of years) {
    const rec = await prisma.year.upsert({
      where: { id: `year-${y.order}` },
      update: { name: y.name },
      create: { id: `year-${y.order}`, name: y.name, order: y.order },
    })
    yearRecords[y.name] = rec.id
  }

  // ===== الشعب =====
  const departments = [
    { name: "علمي علوم", year: "الصف الثالث الثانوي", order: 1 },
    { name: "علمي رياضة", year: "الصف الثالث الثانوي", order: 2 },
    { name: "أدبي", year: "الصف الثالث الثانوي", order: 3 },
  ]
  for (const d of departments) {
    await prisma.department.upsert({
      where: { id: `dep-${d.name}` },
      update: {},
      create: {
        id: `dep-${d.name}`,
        name: d.name,
        yearId: yearRecords[d.year],
        order: d.order,
      },
    })
  }

  // ===== المواد =====
  const subjects = [
    { name: "اللغة العربية", icon: "📖", color: "#f59e0b" },
    { name: "اللغة الإنجليزية", icon: "🇬🇧", color: "#2563eb" },
    { name: "الرياضيات", icon: "📐", color: "#10b981" },
    { name: "الفيزياء", icon: "⚡", color: "#8b5cf6" },
    { name: "الكيمياء", icon: "🧪", color: "#ef4444" },
    { name: "الأحياء", icon: "🧬", color: "#22c55e" },
    { name: "التاريخ", icon: "🏛️", color: "#d97706" },
    { name: "الجغرافيا", icon: "🌍", color: "#0ea5e9" },
    { name: "الدراسات", icon: "🏫", color: "#f43f5e" },
    { name: "العلوم", icon: "🔬", color: "#14b8a6" },
  ]
  for (const s of subjects) {
    await prisma.subject.upsert({
      where: { id: `sub-${s.name}` },
      update: {},
      create: { id: `sub-${s.name}`, name: s.name, icon: s.icon, color: s.color },
    })
  }

  // ===== المدرسون =====
  const teacherUsers: Record<string, string> = {}
  const teacherDefs = [
    { name: "أ/ محمد صلاح", subject: "اللغة العربية", bio: "خبرة 15 سنة في تدريس اللغة العربية للمرحلة الثانوية" },
    { name: "أ/ أحمد فتحي", subject: "الرياضيات", bio: "مدرس رياضيات — تالتة ثانوي" },
    { name: "أ/ كريم الشناوي", subject: "الفيزياء", bio: "متخصص في الفيزياء وشرحها بأسلوب مبسط" },
    { name: "أ/ ياسمين عادل", subject: "اللغة الإنجليزية", bio: "معلمة إنجليزي — خريجة آداب إنجليزي" },
  ]
  for (let i = 0; i < teacherDefs.length; i++) {
    const t = teacherDefs[i]
    const phone = `0110000000${i}`
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        password: adminPassword,
        firstName: t.name.split(" ").slice(0, 2).join(" "),
        middleName: "",
        lastName: t.name.split(" ").slice(2).join(" "),
        role: "TEACHER",
      },
    })
    const teacher = await prisma.teacher.upsert({
      where: { id: `teacher-${t.name}` },
      update: {},
      create: {
        id: `teacher-${t.name}`,
        name: t.name,
        bio: t.bio,
        title: `مدرس ${t.subject}`,
        isFeatured: i < 2,
      },
    })
    await prisma.user.update({ where: { id: user.id }, data: { teacherId: teacher.id } })
    teacherUsers[t.name] = teacher.id
  }

  // ===== الكورسات =====
  const courseDefs = [
    {
      name: "كورس اللغة العربية — التأسيس الشامل",
      subject: "اللغة العربية",
      teacher: "أ/ محمد صلاح",
      price: 350,
      priceBefore: 450,
      featured: true,
      sections: [
        { name: "النحو", items: [
          { type: "video", title: "الدرس الأول — الجملة الاسمية" },
          { type: "video", title: "الدرس الثاني — الجملة الفعلية" },
          { type: "exam", title: "اختبار على النحو" },
        ]},
        { name: "البلاغة", items: [
          { type: "video", title: "الدرس الثالث — التشبيه" },
          { type: "video", title: "الدرس الرابع — الاستعارة" },
          { type: "book", title: "مذكرة البلاغة — ملخص" },
          { type: "exam", title: "واجب البلاغة" },
        ]},
      ],
    },
    {
      name: "كورس الرياضيات — التفاضل والتكامل",
      subject: "الرياضيات",
      teacher: "أ/ أحمد فتحي",
      price: 400,
      priceBefore: 500,
      featured: true,
      sections: [
        { name: "التفاضل", items: [
          { type: "video", title: "مقدمة في النهايات" },
          { type: "video", title: "قواعد الاشتقاق" },
          { type: "exam", title: "اختبار التفاضل" },
        ]},
      ],
    },
    {
      name: "كورس الفيزياء — الكهربية",
      subject: "الفيزياء",
      teacher: "أ/ كريم الشناوي",
      price: 300,
      priceBefore: 380,
      featured: true,
      sections: [
        { name: "الكهربية الساكنة", items: [
          { type: "video", title: "قانون كولوم" },
          { type: "book", title: "كتاب الكهربية الساكنة" },
        ]},
      ],
    },
    {
      name: "كورس الإنجليزي — القواعد الشاملة",
      subject: "اللغة الإنجليزية",
      teacher: "أ/ ياسمين عادل",
      price: 250,
      priceBefore: 320,
      featured: false,
      sections: [
        { name: "Grammar", items: [
          { type: "video", title: "Present Tenses" },
          { type: "exam", title: "Grammar Quiz" },
        ]},
      ],
    },
  ]

  for (const c of courseDefs) {
    const subject = await prisma.subject.findUnique({ where: { id: `sub-${c.subject}` } })
    const existing = await prisma.course.findFirst({ where: { name: c.name } })
    const course = existing ?? (await prisma.course.create({
      data: {
        name: c.name,
        description: `كورس شامل في ${c.subject} مع ${c.teacher}`,
        price: c.price,
        priceBeforeDiscount: c.priceBefore,
        isFeatured: c.featured,
        subjectId: subject!.id,
        teacherId: teacherUsers[c.teacher],
        yearId: yearRecords["الصف الثالث الثانوي"],
      },
    }))

    for (const [si, sec] of c.sections.entries()) {
      const section = await prisma.section.upsert({
        where: { id: `${course.id}-section-${si}` },
        update: {},
        create: { id: `${course.id}-section-${si}`, name: sec.name, courseId: course.id, order: si },
      })

      for (const [ii, item] of sec.items.entries()) {
        if (item.type === "video") {
          await prisma.video.upsert({
            where: { id: `${section.id}-video-${ii}` },
            update: {},
            create: {
              id: `${section.id}-video-${ii}`,
              title: item.title,
              sectionId: section.id,
              provider: "YOUTUBE",
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              duration: 900,
              order: ii,
              isFree: si === 0 && ii === 0,
            },
          })
        }
        if (item.type === "book") {
          await prisma.book.upsert({
            where: { id: `${section.id}-book-${ii}` },
            update: {},
            create: { id: `${section.id}-book-${ii}`, title: item.title, sectionId: section.id, order: ii, fileUrl: "#" },
          })
        }
        if (item.type === "exam") {
          await prisma.exam.upsert({
            where: { id: `${section.id}-exam-${ii}` },
            update: {},
            create: {
              id: `${section.id}-exam-${ii}`,
              title: item.title,
              sectionId: section.id,
              type: item.title.includes("واجب") ? "HOMEWORK" : "EXAM",
              order: ii,
              durationMinutes: 60,
            },
          })

          // أسئلة تجريبية لكل امتحان
          const examQuestions: { text: string; options: string[]; correct: number }[] = [
            {
              text: `السؤال الأول على ${section.name}: ما هي الإجابة الصحيحة؟`,
              options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
              correct: 0,
            },
            {
              text: `السؤال الثاني على ${section.name}: أي مما يلي يعتبر صحيحاً؟`,
              options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
              correct: 1,
            },
            {
              text: `السؤال الثالث على ${section.name}: اختر الإجابة الدقيقة.`,
              options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
              correct: 2,
            },
            {
              text: `السؤال الرابع على ${section.name}: أي خيار يمثل التعريف الصحيح؟`,
              options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
              correct: 3,
            },
            {
              text: `السؤال الخامس على ${section.name}: حدد الإجابة الوحيدة الصحيحة.`,
              options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
              correct: 0,
            },
          ]
          for (let qi = 0; qi < examQuestions.length; qi++) {
            const q = examQuestions[qi]
            await prisma.question.upsert({
              where: { id: `${section.id}-exam-${ii}-q${qi}` },
              update: {},
              create: {
                id: `${section.id}-exam-${ii}-q${qi}`,
                text: q.text,
                type: "MCQ",
                options: q.options,
                correctAnswer: String(q.correct),
                points: 2,
                order: qi,
                examId: `${section.id}-exam-${ii}`,
              },
            })
          }
        }
      }
    }
  }

  // ===== بنك الأسئلة =====
  const bankDefs: Record<string, { chapter: string; questions: { q: string; o: string[]; c: number; d: string }[] }[]> = {
    "اللغة العربية": [
      {
        chapter: "النحو",
        questions: [
          { q: "ما إعراب كلمة (الطالبُ) في جملة «نجحَ الطالبُ»؟", o: ["فاعل مرفوع", "مبتدأ مرفوع", "مفعول به منصوب", "خبر مرفوع"], c: 0, d: "easy" },
          { q: "أي مما يلي يعتبر اسماً من الأسماء الموصولة؟", o: ["الذي", "مهما", "أين", "كم"], c: 0, d: "easy" },
          { q: "الفعل «درس» في جملة «درسَ الطالبُ الدرسَ» نوعه:", o: ["فعل ماضٍ", "فعل مضارع", "فعل أمر", "فعل ناقص"], c: 0, d: "medium" },
          { q: "ما علامة رفع جمع المذكر السالم؟", o: ["الواو", "الألف", "الياء", "الضمة المقدرة"], c: 0, d: "medium" },
          { q: "«إنّ العلمَ نورٌ» — إعراب «العلمَ»:", o: ["اسم إنّ منصوب", "مبتدأ مرفوع", "فاعل مرفوع", "مفعول به منصوب"], c: 0, d: "hard" },
        ],
      },
      {
        chapter: "البلاغة",
        questions: [
          { q: "«الأسدُ يقاتلُ في الميدان» — نوع الصورة البلاغية:", o: ["تشبيه", "استعارة مكنية", "كناية", "مجاز مرسل"], c: 1, d: "medium" },
          { q: "التشبيه يتكون من مشبه ومشبه به وأداة ووجه شبه — حذف الأداة فقط يجعل التشبيه:", o: ["مؤكداً", "بليغاً", "مجملاً", "مفصلاً"], c: 1, d: "hard" },
        ],
      },
    ],
    "الرياضيات": [
      {
        chapter: "التفاضل والتكامل",
        questions: [
          { q: "نهاية الدالة عندما يقترب المتغير من نقطة ما تعبر عن:", o: ["ميل المماس", "الاشتقاق الأول", "قيمة الدالة عند النقطة", "سلوك الدالة بالقرب من النقطة"], c: 3, d: "medium" },
          { q: "مشتقة الدالة الثابتة تساوي:", o: ["صفراً", "العدد الثابت نفسه", "واحداً", "غير معرفة"], c: 0, d: "easy" },
          { q: "إذا كانت ن(س) = س² فإن دص/دس تساوي:", o: ["2س", "س", "س²", "2"], c: 0, d: "easy" },
          { q: "مشتقة حاصل ضرب دالتين تعطى بقاعدة:", o: ["الضرب", "الخارج", "السلسلة", "الكرنك"], c: 0, d: "medium" },
        ],
      },
      {
        chapter: "الكميات غير المتسعة",
        questions: [
          { q: "العدد المركب الذي يقع على محور السينات يكون خياله يساوي:", o: ["صفراً", "واحداً", "سالباً", "موجباً"], c: 0, d: "easy" },
        ],
      },
    ],
    "الفيزياء": [
      {
        chapter: "الكهربية",
        questions: [
          { q: "قانون كولوم ينص على أن القوة بين شحنتين تتناسب:", o: ["عكسياً مع مربع المسافة", "طردياً مع المسافة", "عكسياً مع الشحنة", "طردياً مع مربع المسافة"], c: 0, d: "easy" },
          { q: "وحدة قياس شدة التيار الكهربي هي:", o: ["الأمبير", "الفولت", "الأوم", "الواط"], c: 0, d: "easy" },
          { q: "المقاومة تقاس بوحدة:", o: ["الأوم", "الأمبير", "الكولوم", "الجول"], c: 0, d: "easy" },
          { q: "قانون أوم ينص على أن الجهد يساوي:", o: ["التيار × المقاومة", "التيار ÷ المقاومة", "المقاومة ÷ التيار", "الشحنة × الزمن"], c: 0, d: "medium" },
        ],
      },
    ],
    "اللغة الإنجليزية": [
      {
        chapter: "Grammar",
        questions: [
          { q: "Choose the correct form: He ______ to school every day.", o: ["goes", "go", "going", "gone"], c: 0, d: "easy" },
          { q: "The past form of (go) is:", o: ["went", "gone", "goes", "going"], c: 0, d: "easy" },
          { q: "Choose: She has been working here ______ 2015.", o: ["since", "for", "ago", "during"], c: 0, d: "medium" },
          { q: "The passive of «They built the house» is:", o: ["The house was built", "The house is built", "The house has built", "The house builds"], c: 0, d: "hard" },
        ],
      },
    ],
  }

  for (const [subjectName, chapters] of Object.entries(bankDefs)) {
    const subjectId = `sub-${subjectName}`
    let chapterOrder = 0
    for (const ch of chapters) {
      const chapterId = `bank-${subjectName}-${ch.chapter}`
      await prisma.bankChapter.upsert({
        where: { id: chapterId },
        update: {},
        create: {
          id: chapterId,
          subjectId,
          name: ch.chapter,
          order: chapterOrder++,
        },
      })
      for (let qi = 0; qi < ch.questions.length; qi++) {
        const q = ch.questions[qi]
        await prisma.bankQuestion.upsert({
          where: { id: `${chapterId}-q${qi}` },
          update: {},
          create: {
            id: `${chapterId}-q${qi}`,
            chapterId,
            text: q.q,
            type: "MCQ",
            options: q.o,
            correctAnswer: String(q.c),
            points: 1,
            difficulty: q.d,
            explanation: "الإجابة الصحيحة هي الخيار المميز باللون الأخضر في صفحة النتيجة",
          },
        })
      }
    }
  }

  // ===== إعدادات الدفع =====
  const settings = {
    "payment.vodafone": "01021416244",
    "payment.instapay": "01116544383",
    "brand.name": "طريق النور",
  }
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }

  console.log("✅ اكتملت التهيئة بنجاح!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
