import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

// Define messages directly to avoid import issues
const messages = {
  en: {
    "common": {
      "loading": "Loading...",
      "error": "Error",
      "success": "Success",
      "save": "Save",
      "cancel": "Cancel",
      "submit": "Submit",
      "continue": "Continue",
      "back": "Back",
      "next": "Next",
      "close": "Close",
      "confirm": "Confirm",
      "delete": "Delete",
      "edit": "Edit",
      "view": "View",
      "search": "Search",
      "filter": "Filter",
      "clear": "Clear",
      "all": "All",
      "none": "None",
      "yes": "Yes",
      "no": "No",
      "optional": "Optional",
      "required": "Required"
    },
    "nav": {
      "home": "Home",
      "projects": "My Projects",
      "professionals": "Professionals",
      "tradesmen": "Tradesmen",
      "docs": "Docs",
      "profile": "Profile",
      "logout": "Logout",
      "login": "Login",
      "join": "Join",
      "signup": "Sign Up",
      "admin": "Admin",
      "adminPortal": "Admin Portal",
      "professional": "Professional",
      "editProfessional": "Edit Professional Info",
      "messaging": "Messaging"
    },
    "auth": {
      "login": {
        "title": "Login",
        "email": "Email Address",
        "password": "Password",
        "submit": "Sign In",
        "noAccount": "Don't have an account?",
        "forgotPassword": "Forgot password?",
        "success": "Welcome back!"
      },
      "signup": {
        "title": "Create Account",
        "firstName": "First Name",
        "email": "Email",
        "submit": "Create Account",
        "haveAccount": "Already have an account?"
      }
    },
    "project": {
      "create": {
        "title": "Create Project",
        "heading": "Start Your Project",
        "projectName": "Project Name",
        "location": "Location",
        "budget": "Budget (HKD)",
        "submit": "Create",
        "success": "Created successfully!"
      },
      "list": {
        "title": "My Projects",
        "empty": "No projects yet"
      }
    },
    "professional": {
      "dashboard": {
        "title": "Professional Dashboard",
        "myProjects": "My Projects",
        "pendingQuotes": "Pending Quotes"
      },
      "profile": {
        "title": "Professional Profile",
        "businessName": "Business Name"
      }
    },
    "financial": {
      "escrow": {
        "title": "Escrow",
        "amount": "Amount (HKD)"
      },
      "payment": {
        "title": "Payment",
        "request": "Payment Request",
        "approved": "Approved",
        "paid": "Paid"
      }
    },
    "admin": {
      "dashboard": "Admin Dashboard",
      "messaging": {
        "title": "Messaging"
      }
    },
    "chat": {
      "title": "Messages",
      "send": "Send"
    },
    "home": {
      "hero": {
        "tagline": "Professional Fitout Management Platform",
        "title": "Transform Your Space with Fitout Hub",
        "description": "Connect with trusted professionals, manage projects, and complete fitouts on time and budget"
      },
      "quickStart": {
        "tagline": "Get Started in 3 Steps",
        "title": "Post a Project & Get Quotes",
        "newProjectButton": "Create Your First Project"
      },
      "features": {
        "tabs": {
          "why": "Why Fitout Hub",
          "how": "How It Works",
          "who": "Who We Are",
          "choose": "Choose Fitout Hub"
        },
        "why": {
          "title": "Why Choose Fitout Hub?",
          "description": "The complete solution for managing your fitout projects",
          "secure": {
            "title": "Secure Transactions",
            "description": "Protected escrow payments and verified contractors"
          },
          "contracts": {
            "title": "Smart Contracts",
            "description": "Automated agreements and milestone payments"
          },
          "oversight": {
            "title": "Project Oversight",
            "description": "Real-time tracking and professional management"
          },
          "collaboration": {
            "title": "Easy Collaboration",
            "description": "Integrated messaging and document sharing"
          }
        },
        "how": {
          "title": "How It Works",
          "description": "Simple steps to get your project started",
          "plan": {
            "title": "1. Plan Your Project",
            "description": "Describe your fitout needs and budget requirements"
          },
          "match": {
            "title": "2. Match with Professionals",
            "description": "Receive quotes from verified contractors in your area"
          },
          "manage": {
            "title": "3. Manage & Complete",
            "description": "Track progress, manage payments, and communicate seamlessly"
          }
        },
        "who": {
          "title": "Who We Are",
          "description": "Transforming the fitout industry with technology"
        },
        "choose": {
          "title": "Why Choose Fitout Hub?",
          "description": "Join hundreds of satisfied clients and professionals"
        }
      }
    },
    "footer": {
      "description": "Connect with trusted professionals and manage your fitout projects seamlessly.",
      "browse": "Browse",
      "forClients": "For Clients",
      "account": "Account",
      "professionals": "Professionals",
      "tradesmen": "Tradesmen",
      "getStarted": "Get Started",
      "createProject": "Create Project",
      "login": "Login",
      "join": "Join",
      "copyright": "© {year} Fitout Hub. All rights reserved.",
      "twitter": "Twitter",
      "linkedin": "LinkedIn",
      "instagram": "Instagram"
    },
    "errors": {
      "generic": "Something went wrong",
      "registrationFailed": "Registration failed"
    },
    "validation": {
      "required": "This field is required",
      "passwordMismatch": "Passwords do not match"
    }
  },
  "zh-HK": {
    "common": {
      "loading": "載入中...",
      "error": "錯誤",
      "success": "成功",
      "save": "儲存",
      "cancel": "取消",
      "submit": "提交",
      "continue": "繼續",
      "back": "返回",
      "next": "下一步",
      "close": "關閉",
      "confirm": "確認",
      "delete": "刪除",
      "edit": "編輯",
      "view": "查看",
      "search": "搜尋",
      "filter": "篩選",
      "clear": "清除",
      "all": "全部",
      "none": "無",
      "yes": "是",
      "no": "否",
      "optional": "選填",
      "required": "必填"
    },
    "nav": {
      "home": "首頁",
      "projects": "我的項目",
      "professionals": "專業人士",
      "tradesmen": "技工",
      "docs": "文檔",
      "profile": "個人資料",
      "logout": "登出",
      "login": "登入",
      "join": "加入",
      "signup": "註冊",
      "admin": "管理員",
      "adminPortal": "管理員入口",
      "professional": "專業人士",
      "editProfessional": "編輯專業人士資料",
      "messaging": "訊息"
    },
    "auth": {
      "login": {
        "title": "登入",
        "email": "電郵地址",
        "password": "密碼",
        "submit": "登入",
        "noAccount": "還未有帳戶?",
        "forgotPassword": "忘記密碼?",
        "success": "歡迎返回!"
      },
      "signup": {
        "title": "建立帳戶",
        "firstName": "名字",
        "email": "電郵",
        "submit": "建立帳戶",
        "haveAccount": "已有帳戶?"
      }
    },
    "project": {
      "create": {
        "title": "建立項目",
        "heading": "開始您的項目",
        "projectName": "項目名稱",
        "location": "地點",
        "budget": "預算 (港幣)",
        "submit": "建立",
        "success": "建立成功!"
      },
      "list": {
        "title": "我的項目",
        "empty": "暫無項目"
      }
    },
    "professional": {
      "dashboard": {
        "title": "專業人士儀錶板",
        "myProjects": "我的項目",
        "pendingQuotes": "待處理報價"
      },
      "profile": {
        "title": "專業人士資料",
        "businessName": "公司名稱"
      }
    },
    "financial": {
      "escrow": {
        "title": "託管",
        "amount": "金額 (港幣)"
      },
      "payment": {
        "title": "付款",
        "request": "付款要求",
        "approved": "已批准",
        "paid": "已付款"
      }
    },
    "admin": {
      "dashboard": "管理員儀錶板",
      "messaging": {
        "title": "訊息"
      }
    },
    "chat": {
      "title": "訊息",
      "send": "傳送"
    },
    "home": {
      "hero": {
        "tagline": "專業裝修管理平台",
        "title": "使用 Fitout Hub 改造您的空間",
        "description": "連接信任的專業人士、管理項目、按時間和預算完成裝修"
      },
      "quickStart": {
        "tagline": "3個步驟快速開始",
        "title": "發佈項目並獲取報價",
        "newProjectButton": "建立您的首個項目"
      },
      "features": {
        "tabs": {
          "why": "為什麼選擇Fitout Hub",
          "how": "運作方式",
          "who": "我們是誰",
          "choose": "選擇Fitout Hub"
        },
        "why": {
          "title": "為什麼選擇Fitout Hub？",
          "description": "完整的裝修項目管理方案",
          "secure": {
            "title": "安全交易",
            "description": "受保護的託管付款和認證承包商"
          },
          "contracts": {
            "title": "智能合約",
            "description": "自動化協議和里程碑付款"
          },
          "oversight": {
            "title": "項目監督",
            "description": "實時追蹤和專業管理"
          },
          "collaboration": {
            "title": "輕鬆協作",
            "description": "集成通訊和文件共享"
          }
        },
        "how": {
          "title": "運作方式",
          "description": "簡單步驟開始您的項目",
          "plan": {
            "title": "1. 規劃項目",
            "description": "描述您的裝修需求和預算要求"
          },
          "match": {
            "title": "2. 配對專業人士",
            "description": "從您所在地區的認證承包商獲取報價"
          },
          "manage": {
            "title": "3. 管理和完成",
            "description": "追蹤進度、管理付款、無縫溝通"
          }
        },
        "who": {
          "title": "我們是誰",
          "description": "用技術改造裝修行業"
        },
        "choose": {
          "title": "為什麼選擇Fitout Hub？",
          "description": "加入數百名滿意的客戶和專業人士"
        }
      }
    },
    "footer": {
      "description": "連接信任的專業人士、管理項目、無縫完成裝修項目。",
      "browse": "瀏覽",
      "forClients": "客戶",
      "account": "帳戶",
      "professionals": "專業人士",
      "tradesmen": "技工",
      "getStarted": "開始使用",
      "createProject": "建立項目",
      "login": "登入",
      "join": "加入",
      "copyright": "© {year} Fitout Hub。版權所有。",
      "twitter": "Twitter",
      "linkedin": "LinkedIn",
      "instagram": "Instagram"
    },
    "errors": {
      "generic": "發生錯誤",
      "registrationFailed": "註冊失敗"
    },
    "validation": {
      "required": "此欄為必填",
      "passwordMismatch": "密碼不相符"
    }
  }
} as const;

export default getRequestConfig(async () => {
  // Get locale from cookie first, then Accept-Language header
  const cookieStore = await cookies();
  const headersList = await headers();
  
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const acceptLanguage = headersList.get('accept-language');
  
  // Default to English, support Cantonese (zh-HK)
  let locale: 'en' | 'zh-HK' = 'en';
  
  // Priority: cookie > accept-language header
  if (localeCookie && ['en', 'zh-HK'].includes(localeCookie)) {
    locale = localeCookie as 'en' | 'zh-HK';
  } else if (acceptLanguage?.includes('zh')) {
    locale = 'zh-HK';
  }

  return {
    locale,
    messages: messages[locale],
    routing: {
      localePrefix: 'never',
    },
  };
});
