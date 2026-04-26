export type Lang = "zh" | "en" | "ar"

export const content = {
  zh: {
    dir: "ltr" as const,
    nav: { zh: "中文", en: "English", ar: "عربي" },
    hero: {
      badge: "香港新资本投资者入境计划 (New CIES)",
      title: "以资本为桥，开启香港新章",
      subtitle: "HK$3,000万 · 全家居留权 · 7年永居路径",
      cta1: "预约专业咨询",
      cta2: "查看 ILI 投资组合方案",
    },
    advantages: [
      { icon: "🏦", title: "全球金融中心", desc: "香港税制简单，无资本利得税、无遗产税" },
      { icon: "👨‍👩‍👧", title: "全家随行居留", desc: "配偶及18岁以下子女可同步获得居留权" },
      { icon: "🌏", title: "7年永居路径", desc: "连续通常居住满7年后可申请香港永久居民" },
      { icon: "📈", title: "资产留港增值", desc: "通过ILI投连险合规持有，税务递延优化回报" },
    ],
    eligibility: {
      title: "申请资格",
      mainland: {
        badge: "内地人士",
        warning: "纯内地户籍人士不可直接申请，须先取得第三国永居身份",
        paths: [
          "✅ 已持美/加/欧/澳/新等国绿卡",
          "✅ 瓦努阿图 / 几内亚比绍等小国永居（周期短）",
          "✅ 澳门居民 / 台湾华籍居民（直接申请）",
        ],
        usWarning: "⚠️ 美国籍人士：须特别注意 FATCA 税务合规风险，建议先咨询跨境税务律师",
        cta: "预约资格评估",
      },
      overseas: {
        badge: "海外人士",
        paths: [
          "✅ 外国国籍人士（阿富汗/古巴/朝鲜除外）",
          "✅ 已取得外国永居的中国籍人士",
        ],
        requirements: [
          "申请前6个月净资产持续 ≥ HK$3,000万",
          "投资 HK$3,000万 于获许资产（含300万CIES组合）",
          "无犯罪/不良记录，有自给能力及住所证明",
        ],
        cta: "立即检视申请资格",
      },
    },
    investment: {
      title: "投资结构",
      subtitle: "HK$3,000万 如何配置",
      items: [
        { pct: "10%", label: "CIES组合（InvestHK管理）", amount: "HK$3,000,000", color: "#4d9ef5" },
        { pct: "90%", label: "获许金融资产（ILI投连险）", amount: "HK$27,000,000", color: "#2563a8" },
      ],
      iliNote: "Wonder 推荐：以 ILI 投连险承载 HK$2,700万获许金融资产",
      iliReason: "为什么选择 ILI？",
      articles: [
        { title: "投资移民必读：为什么投连险是CIES计划的最优解？", slug: "ili-cies", available: true },
        { title: "CIES申请全流程指南：从0到拿到居留许可", slug: "cies-guide", available: true },
      ],
      portfolios: {
        title: "推荐投资组合模型",
        subtitle: "基于 ILI 容器的 HK$2,700万 获许资产配置方案",
        labels: {
          focus: "配置重点",
          features: "组合特点",
          target: "适用人群",
          analysis: "7年预期分析",
          cta: "进入 FIS 模拟器"
        },
        items: [
          {
            id: "conservative",
            name: "保守稳健模型",
            tag: "稳健收益 · 风险厌恶",
            focus: "债券基金配比较高 (70%-80%)",
            desc: "以高评级债券基金为底仓，辅以少量平衡型基金。旨在保护本金的同时，获取高于存款利率的稳定回报。",
            target: "风险承受能力较低，首要目标是 7 年后安全撤出本金并获得稳健增值的投资者。",
            analysis: "7年预期收益：年化 4%-5%，波动极小。适合作为‘压舱石’资产，确认为入境处合规资产的首选。",
            icon: "🛡️"
          },
          {
            id: "dividend",
            name: "现金流派息模型",
            tag: "每月派息 · 香港生活",
            focus: "精选高股息/派息债组合",
            desc: "通过配置具有稳定分红记录的基金组合，实现每月现金流流向。无需赎回本金即可支付在港生活开支。",
            target: "计划在香港长期居住，希望资产能像‘自动提款机’一样覆盖生活成本的高净值家庭。",
            analysis: "7年无忧之选：预期年化现金流 5%-7%。7 年累积现金流可覆盖大部分香港生活开支，本金随市波动。",
            icon: "💰"
          },
          {
            id: "growth",
            name: "长线积累模型",
            tag: "全球资产 · 财富倍增",
            focus: "100% 累积型股票/混合基金",
            desc: "对标全球优质资产（如美股、科技、全球增长），不进行期间派息，所有收益自动再投资，享受复利增长。",
            target: "资产规模较大，不急于期间现金流，旨在 7 年后实现显著财富跨越的进取型投资者。",
            analysis: "7年预期分析：年化 7%-10%+。波动较大但长期复合回报高。适合作为全球化资产配置的重要版图。",
            icon: "🚀"
          }
        ]
      }
    },
    timeline: {
      title: "居留路径：2+3+3 模式",
      steps: [
        { year: "第0年", label: "申请获批", desc: "初次许可，24个月" },
        { year: "第2年", label: "首次续期", desc: "延长3年" },
        { year: "第5年", label: "再次续期", desc: "延长3年" },
        { year: "第7年+", label: "申请永久居留", desc: "连续通常居住满7年" },
      ],
    },
    faq: [
      { q: "内地人可以直接申请吗？", a: "纯内地户籍人士不能直接申请，必须先取得外国永久居留资格（如美/加绿卡）或拥有澳门/台湾居留身份，方能符合申请资格。" },
      { q: "瓦努阿图等小国永居是否被认可？", a: "是的。香港入境处认可合法取得的外国永久居留身份，包括瓦努阿图、几内亚比绍等国的绿卡。申请人须确保文件合法合规，能通过入境处核实。" },
      { q: "美国籍人士申请有何特殊风险？", a: "美籍人士技术上符合资格，但受FATCA影响，香港银行为美国人开户和提供投资产品存在较大障碍，且美国公民全球收入须向IRS申报，建议先咨询跨境税务律师。" },
      { q: "为什么通过投连险来满足投资要求？", a: "ILI投连险属于香港监管下的合规获许资产，同时具备税务递延（中国税务居民免每年计税）、资产传承（保单受益人架构）、专业基金管理等多重优势。" },
      { q: "子女可以随行吗？", a: "可以。配偶及18岁以下未婚受养子女可同步申请居留，与主申请人同步续期。" },
      { q: "7年内是否可以减少投资？", a: "不可以。持有期间须持续符合投资要求，每年须向当局报告及证明投资合规，直至成功申请永居后方可按规定退出。" },
    ],
    form: {
      title: "开始您的专属资格评估",
      subtitle: "填写以下信息，顾问将于1-2个工作日内与您联系",
      fields: {
        name: "姓名",
        contact: "联系方式（邮箱或微信/WhatsApp）",
        location: "当前居住地",
        status: "当前身份",
        message: "补充说明（可选）",
      },
      locationOptions: [
        { value: "mainland", label: "中国大陆" },
        { value: "hongkong", label: "香港" },
        { value: "macau", label: "澳门" },
        { value: "taiwan", label: "台湾" },
        { value: "usa", label: "美国" },
        { value: "middle_east", label: "中东地区" },
        { value: "europe", label: "欧洲" },
        { value: "other", label: "其他海外" },
      ],
      statusOptions: [
        { value: "mainland_only", label: "纯内地户籍（无外国身份）" },
        { value: "has_foreign_pr", label: "已持有外国永居身份" },
        { value: "foreign_national", label: "外国国籍" },
        { value: "other", label: "其他" },
      ],
      submit: "提交预约申请",
      submitting: "提交中...",
      success: "✅ 申请已提交，我们将尽快与您联系！",
      error: "提交失败，请稍后重试或直接联系我们。",
      disclaimer: "本页面内容仅供教育及参考用途，不构成法律、移民或投资建议。",
    },
  },

  en: {
    dir: "ltr" as const,
    nav: { zh: "中文", en: "English", ar: "عربي" },
    hero: {
      badge: "Hong Kong New Capital Investment Entrant Scheme (New CIES)",
      title: "Capital as Your Bridge to Hong Kong",
      subtitle: "HK$30M Investment · Family Residency · Permanent Residency Pathway",
      cta1: "Book a Consultation",
      cta2: "View ILI Portfolio Plans",
    },
    advantages: [
      { icon: "🏦", title: "World Financial Hub", desc: "Simple tax system — no capital gains tax, no inheritance tax" },
      { icon: "👨‍👩‍👧", title: "Family Residency", desc: "Spouse and children under 18 can receive residency rights" },
      { icon: "🌏", title: "PR After 7 Years", desc: "Apply for permanent residency after 7 years of ordinary residence" },
      { icon: "📈", title: "Compliant HK Investment", desc: "Hold assets via ILI with tax deferral advantages" },
    ],
    eligibility: {
      title: "Eligibility",
      mainland: {
        badge: "Mainland Chinese",
        warning: "Mainland Chinese residents CANNOT apply directly. A third-country PR status is required first.",
        paths: [
          "✅ Holders of US / Canada / Europe / Australia / Singapore PR",
          "✅ Vanuatu / Guinea-Bissau PR (shorter processing, cost-effective)",
          "✅ Macao residents / Taiwan Chinese nationals (direct application)",
        ],
        usWarning: "⚠️ US Persons: Significant FATCA compliance challenges — consult a cross-border tax attorney first.",
        cta: "Book Eligibility Assessment",
      },
      overseas: {
        badge: "Overseas Applicants",
        paths: [
          "✅ Foreign nationals (except Afghanistan, Cuba, North Korea)",
          "✅ Chinese nationals with foreign permanent residency",
        ],
        requirements: [
          "Net assets ≥ HK$30M continuously for 6 months before application",
          "Invest HK$30M in permissible assets (incl. HK$3M CIES Portfolio)",
          "No adverse/criminal records, financial self-sufficiency & accommodation",
        ],
        cta: "Check Your Eligibility",
      },
    },
    investment: {
      title: "Investment Structure",
      subtitle: "How HK$30 Million Is Allocated",
      items: [
        { pct: "10%", label: "CIES Portfolio (InvestHK managed)", amount: "HK$3,000,000", color: "#4d9ef5" },
        { pct: "90%", label: "Permissible Financial Assets (via ILI)", amount: "HK$27,000,000", color: "#2563a8" },
      ],
      iliNote: "Wonder recommends: Use ILI investment-linked insurance to hold the HK$27M permissible financial assets",
      iliReason: "Why ILI?",
      articles: [
        { title: "Why ILI Is the Optimal Vehicle for Your CIES HK$27M Investment", slug: "ili-cies", available: true },
        { title: "Complete CIES Application Guide: From Zero to Your HK Permit", slug: "cies-guide", available: true },
      ],
      portfolios: {
        title: "Recommended Portfolio Models",
        subtitle: "HK$27M Permissible Asset Allocation Strategies via ILI",
        labels: {
          focus: "Core Focus",
          features: "Key Features",
          target: "Target Investors",
          analysis: "7-Year Outlook",
          cta: "Enter FIS Simulator"
        },
        items: [
          {
            id: "conservative",
            name: "Conservative & Stable",
            tag: "Steady Return · Risk Averse",
            focus: "High Bond Allocation (70%-80%)",
            desc: "Focuses on high-rating bond funds with a small portion of balanced funds. Aims to protect principal while achieving stable returns above deposit rates.",
            target: "Investors with low risk tolerance whose primary goal is to secure principal and steady growth over 7 years.",
            analysis: "7-Year Outlook: Annualized 4%-5% with minimal volatility. Ideal for 'ballast' asset positioning.",
            icon: "🛡️"
          },
          {
            id: "dividend",
            name: "Cash Flow Dividend",
            tag: "Monthly Payout · HK Living",
            focus: "Selection of High-Dividend Funds",
            desc: "Implements a consistent monthly cash flow through funds with stable dividend records to cover living expenses in Hong Kong without redeeming principal.",
            target: "HNW families planning to reside in HK long-term, needing the portfolio to act as an 'ATM' for living costs.",
            analysis: "7-Year Worry-Free Choice: Expected 5%-7% annual cash flow. Covers most HK expenses while principal fluctuates with market.",
            icon: "💰"
          },
          {
            id: "growth",
            name: "Long-term Accumulation",
            tag: "Global Assets · Wealth Growth",
            focus: "100% Accumulating Equity/Mixed Funds",
            desc: "Benchmarks against global quality assets (US stocks, Tech, Global Growth). No payouts; all returns are reinvested to leverage compounding.",
            target: "Aggressive investors with significant assets who prioritize long-term capital appreciation over immediate cash flow.",
            analysis: "7-Year Projection: Annualized 7%-10%+. Higher volatility but significant compounding potential.",
            icon: "🚀"
          }
        ]
      }
    },
    timeline: {
      title: "Residency Pathway: 2+3+3 Model",
      steps: [
        { year: "Year 0", label: "Approval Granted", desc: "Initial permit, 24 months" },
        { year: "Year 2", label: "First Renewal", desc: "Extended 3 years" },
        { year: "Year 5", label: "Second Renewal", desc: "Extended 3 years" },
        { year: "Year 7+", label: "Apply for PR", desc: "7 years of ordinary residence" },
      ],
    },
    faq: [
      { q: "Can Mainland Chinese apply directly?", a: "No. Mainland Chinese residents must first obtain foreign permanent residency (e.g., US/Canada green card) or hold Macao/Taiwan residency status before they are eligible." },
      { q: "Are small-nation IDs like Vanuatu accepted?", a: "Yes. HKID accepts lawfully obtained foreign permanent residency, including Vanuatu and Guinea-Bissau. Documents must be verifiable and legally compliant." },
      { q: "What are the risks for US persons?", a: "US citizens are technically eligible, but FATCA compliance makes it very difficult to open HK bank accounts and hold investment products. US citizens must also report global income to the IRS. Cross-border tax advice is strongly recommended." },
      { q: "Why use ILI for the investment?", a: "ILI policies are compliant permissible assets under HK regulation, offering tax deferral (no annual capital gains tax for Chinese tax residents), estate planning benefits, and professional portfolio management." },
      { q: "Can my family join me?", a: "Yes. Spouse and unmarried children under 18 can apply simultaneously and their permits are renewed together with the main applicant." },
      { q: "Can I reduce my investment within 7 years?", a: "No. You must maintain the investment continuously and report compliance annually until you successfully obtain permanent residency." },
    ],
    form: {
      title: "Begin Your Eligibility Assessment",
      subtitle: "Complete the form and our advisor will contact you within 1-2 business days",
      fields: {
        name: "Full Name",
        contact: "Contact (Email or WeChat/WhatsApp)",
        location: "Current Location",
        status: "Current Status",
        message: "Additional Notes (Optional)",
      },
      locationOptions: [
        { value: "mainland", label: "Mainland China" },
        { value: "hongkong", label: "Hong Kong" },
        { value: "macau", label: "Macao" },
        { value: "taiwan", label: "Taiwan" },
        { value: "usa", label: "United States" },
        { value: "middle_east", label: "Middle East" },
        { value: "europe", label: "Europe" },
        { value: "other", label: "Other Overseas" },
      ],
      statusOptions: [
        { value: "mainland_only", label: "Mainland Chinese only (no foreign ID)" },
        { value: "has_foreign_pr", label: "Hold foreign permanent residency" },
        { value: "foreign_national", label: "Foreign national" },
        { value: "other", label: "Other" },
      ],
      submit: "Submit Inquiry",
      submitting: "Submitting...",
      success: "✅ Inquiry submitted! We'll be in touch shortly.",
      error: "Submission failed. Please try again or contact us directly.",
      disclaimer: "Content is for educational purposes only and does not constitute legal, immigration, or investment advice.",
    },
  },

  ar: {
    dir: "rtl" as const,
    nav: { zh: "中文", en: "English", ar: "عربي" },
    hero: {
      badge: "مخطط دخول المستثمرين الرأسماليين الجديد في هونغ كونغ (New CIES)",
      title: "رأس المال جسرك إلى هونغ كونغ",
      subtitle: "استثمار 30 مليون دولار هونغ كونغ · إقامة عائلية · مسار الإقامة الدائمة",
      cta1: "احجز استشارة احترافية",
      cta2: "عرض خطط المحافظ الاستثمارية",
    },
    advantages: [
      { icon: "🏦", title: "مركز مالي عالمي", desc: "نظام ضريبي بسيط — لا ضريبة على أرباح رأس المال ولا ضريبة على الميراث" },
      { icon: "👨‍👩‍👧", title: "إقامة عائلية", desc: "يحق للزوج والأطفال دون 18 سنة الحصول على حق الإقامة" },
      { icon: "🌏", title: "إقامة دائمة بعد 7 سنوات", desc: "تقديم طلب الإقامة الدائمة بعد 7 سنوات من الإقامة المعتادة" },
      { icon: "📈", title: "استثمار متوافق في هونغ كونغ", desc: "احتفظ بأصولك عبر ILI مع مزايا تأجيل الضرائب" },
    ],
    eligibility: {
      title: "شروط الأهلية",
      mainland: {
        badge: "المتقدمون من البر الرئيسي",
        warning: "لا يمكن للمقيمين في البر الرئيسي التقديم مباشرة. يُشترط الحصول أولاً على إقامة دائمة في دولة ثالثة.",
        paths: [
          "✅ حاملو الإقامة الدائمة الأمريكية / الكندية / الأوروبية / الأسترالية",
          "✅ الإقامة الدائمة في فانواتو / غينيا بيساو (معالجة أسرع وأقل تكلفة)",
          "✅ المقيمون في ماكاو / المواطنون الصينيون التايوانيون (تقديم مباشر)",
        ],
        usWarning: "⚠️ حاملو الجنسية الأمريكية: تحديات امتثال FATCA الكبيرة — استشر محامياً ضريبياً متخصصاً أولاً.",
        cta: "احجز تقييم الأهلية",
      },
      overseas: {
        badge: "المتقدمون من الخارج",
        paths: [
          "✅ مواطنون أجانب (باستثناء أفغانستان وكوبا وكوريا الشمالية)",
          "✅ مواطنون صينيون يحملون إقامة دائمة أجنبية",
        ],
        requirements: [
          "صافي أصول ≥ 30 مليون دولار هونغ كونغ باستمرار لمدة 6 أشهر قبل التقديم",
          "استثمار 30 مليون دولار هونغ كونغ في أصول مسموح بها (بما في ذلك 3 ملايين دولار لمحفظة CIES)",
          "لا سجلات سلبية/جنائية، القدرة المالية الذاتية وإثبات السكن",
        ],
        cta: "تحقق من أهليتك",
      },
    },
    investment: {
      title: "هيكل الاستثمار",
      subtitle: "كيف يتم توزيع 30 مليون دولار هونغ كونغ",
      items: [
        { pct: "10%", label: "محفظة CIES (تدار بواسطة InvestHK)", amount: "3,000,000 دولار هونغ كونغ", color: "#4d9ef5" },
        { pct: "90%", label: "الأصول المالية المسموح بها (عبر ILI)", amount: "27,000,000 دولار هونغ كونغ", color: "#2563a8" },
      ],
      iliNote: "توصية Wonder: استخدم وثيقة التأمين المرتبطة بالاستثمار (ILI) للاحتفاظ بالأصول البالغة 27 مليون دولار هونغ كونغ",
      iliReason: "لماذا ILI؟",
      articles: [
        { title: "لماذا ILI هو الخيار الأمثل لاستثمار 27 مليون دولار هونغ كونغ في CIES", slug: "ili-cies", available: true },
        { title: "الدليل الشامل للتقديم في CIES: من الصفر إلى الحصول على تصريح الإقامة", slug: "cies-guide", available: true },
      ],
      portfolios: {
        title: "نماذج المحافظ الاستثمارية الموصى بها",
        subtitle: "استراتيجيات توزيع الأصول المسموح بها بقيمة 27 مليون دولار عبر ILI",
        labels: {
          focus: "التركيز الأساسي",
          features: "الميزات الرئيسية",
          target: "المستثمرون المستهدفون",
          analysis: "تحليل 7 سنوات",
          cta: "دخول محاكي FIS"
        },
        items: [
          {
            id: "conservative",
            name: "النموذج المحافظ والمستقر",
            tag: "عائد ثابت · تجنب المخاطر",
            focus: "تخصيص عالٍ للسندات (70%-80%)",
            desc: "يركز على صناديق السندات ذات التصنيف العالي مع جزء صغير من الصناديق المتوازنة. يهدف لحماية رأس المال وتحقيق عوائد مستقرة.",
            target: "المستثمرون ذوو القدرة المنخفضة على تحمل المخاطر والذين يهدفون لتأمين رأس المال ونمو ثابت على مدى 7 سنوات.",
            analysis: "توقعات 7 سنوات: عائد سنوي 4%-5% مع تقلبات طفيفة جداً. مثالي كأصول أساسية مستقرة.",
            icon: "🛡️"
          },
          {
            id: "dividend",
            name: "نموذج التدفق النقدي والأرباح",
            tag: "توزيعات شهرية · معيشة هونغ كونغ",
            focus: "مجموعة مختارة من صناديق الأرباح العالية",
            desc: "يحقق تدفقاً نقدياً شهرياً ثابتاً من خلال صناديق ذات سجلات توزيع أرباح مستقرة لتغطية تكاليف المعيشة دون الحاجة لاسترداد رأس المال.",
            target: "العائلات ذات الملاءة المالية العالية التي تخطط للإقامة الطويلة في هونغ كونغ وتحتاج لتغطية تكاليف المعيشة.",
            analysis: "خيار 7 سنوات بلا قلق: تدفق نقدي سنوي متوقع 5%-7%. يغطي معظم نفقات هونغ كونغ.",
            icon: "💰"
          },
          {
            id: "growth",
            name: "نموذج التراكم طويل الأمد",
            tag: "أصول عالمية · تضاعف الثروة",
            focus: "صناديق أسهم/مختلطة تراكمية 100%",
            desc: "يرتبط بالأصول العالمية عالية الجودة (الأسهم الأمريكية، التكنولوجيا). لا توجد توزيعات؛ يتم إعادة استثمار جميع العوائد.",
            target: "المستثمرون الطموحون الذين يعطون الأولوية لزيادة رأس المال على المدى الطويل بدلاً من التدفق النقدي الفوري.",
            analysis: "تحليل 7 سنوات: عائد سنوي متوقع 7%-10%+. تقلبات أعلى ولكن إمكانات نمو هائلة.",
            icon: "🚀"
          }
        ]
      }
    },
    timeline: {
      title: "مسار الإقامة: نموذج 2+3+3",
      steps: [
        { year: "السنة 0", label: "منح الموافقة", desc: "تصريح أولي، 24 شهراً" },
        { year: "السنة 2", label: "التجديد الأول", desc: "تمديد 3 سنوات" },
        { year: "السنة 5", label: "التجديد الثاني", desc: "تمديد 3 سنوات" },
        { year: "السنة 7+", label: "التقديم للإقامة الدائمة", desc: "7 سنوات من الإقامة المعتادة" },
      ],
    },
    faq: [
      { q: "هل يمكن للمواطنين الصينيين من البر الرئيسي التقديم مباشرة؟", a: "لا. يجب على المقيمين في البر الرئيسي الحصول أولاً على إقامة دائمة أجنبية (مثل البطاقة الخضراء الأمريكية أو الكندية) أو الإقامة في ماكاو/تايوان قبل أن يكونوا مؤهلين." },
      { q: "هل يُقبل تصريح إقامة دولة صغيرة مثل فانواتو؟", a: "نعم. تقبل دائرة الهجرة في هونغ كونغ الإقامة الدائمة الأجنبية المكتسبة بشكل قانوني، بما في ذلك فانواتو وغينيا بيساو. يجب أن تكون الوثائق قابلة للتحقق." },
      { q: "ما هي المخاطر الخاصة بحاملي الجنسية الأمريكية؟", a: "المواطنون الأمريكيون مؤهلون من الناحية التقنية، لكن FATCA يجعل فتح حسابات مصرفية في هونغ كونغ أمراً صعباً للغاية. كما يجب على المواطنين الأمريكيين الإبلاغ عن دخلهم العالمي لمصلحة الضرائب الأمريكية." },
      { q: "لماذا استخدام ILI للاستثمار؟", a: "وثائق ILI هي أصول مسموح بها وفق لوائح هونغ كونغ، وتوفر تأجيل الضرائب وفوائد تخطيط الثروة وإدارة المحفظة المهنية." },
      { q: "هل يمكن لعائلتي مرافقتي؟", a: "نعم. يمكن للزوج والأطفال غير المتزوجين دون 18 سنة التقديم في وقت واحد ويتم تجديد تصاريحهم مع المتقدم الرئيسي." },
      { q: "هل يمكنني تقليل استثمارات خلال 7 سنوات؟", a: "لا. يجب الحفاظ على الاستثمار باستمرار والإبلاغ عن الامتثال سنوياً حتى الحصول على الإقامة الدائمة بنجاح." },
    ],
    form: {
      title: "ابدأ تقييم أهليتك المخصص",
      subtitle: "أكمل النموذج وسيتواصل معك مستشارنا خلال 1-2 يوم عمل",
      fields: {
        name: "الاسم الكامل",
        contact: "معلومات الاتصال (البريد الإلكتروني أو واتساب)",
        location: "موقعك الحالي",
        status: "وضعك الحالي",
        message: "ملاحظات إضافية (اختياري)",
      },
      locationOptions: [
        { value: "mainland", label: "الصين البر الرئيسي" },
        { value: "hongkong", label: "هونغ كونغ" },
        { value: "macau", label: "ماكاو" },
        { value: "taiwan", label: "تايوان" },
        { value: "usa", label: "الولايات المتحدة" },
        { value: "middle_east", label: "الشرق الأوسط" },
        { value: "europe", label: "أوروبا" },
        { value: "other", label: "دول أخرى" },
      ],
      statusOptions: [
        { value: "mainland_only", label: "مواطن صيني فقط (بدون هوية أجنبية)" },
        { value: "has_foreign_pr", label: "أحمل إقامة دائمة أجنبية" },
        { value: "foreign_national", label: "مواطن أجنبي" },
        { value: "other", label: "أخرى" },
      ],
      submit: "إرسال الاستفسار",
      submitting: "جارٍ الإرسال...",
      success: "✅ تم إرسال طلبك! سنتواصل معك قريباً.",
      error: "فشل الإرسال. يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.",
      disclaimer: "المحتوى لأغراض تعليمية فقط ولا يشكل نصيحة قانونية أو استثمارية.",
    },
  },
} satisfies Record<Lang, unknown>
