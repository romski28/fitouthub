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
      "join": {
        "title": "Join Fitout Hub",
        "subtitle": "Choose how you'd like to get started",
        "clientTitle": "Join as Client",
        "clientDescription": "Find professionals for your fitout project. Post projects and get quotes from verified contractors.",
        "professionalTitle": "Join as Professional",
        "professionalDescription": "Register your business and connect with clients. Bid on projects and grow your client base."
      },
      "login": {
        "title": "Login",
        "email": "Email Address",
        "password": "Password",
        "submit": "Sign In",
        "noAccount": "Don't have an account?",
        "forgotPassword": "Forgot password?",
        "success": "Welcome back!",
        "welcome": "Welcome to Fitout Hub",
        "clientLabel": "Client",
        "professionalLabel": "Professional",
        "professionalText": "Professional account?",
        "homePage": "home page",
        "contactUs": "contact us"
      },
      "signup": {
        "title": "Create Account",
        "intro": "Get started with your fitout project",
        "username": "Username",
        "firstName": "First Name",
        "lastName": "Last Name",
        "email": "Email",
        "mobile": "Mobile",
        "password": "Password",
        "confirmPassword": "Confirm Password",
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
          "why": "Why Choose Us",
          "how": "How It Works",
          "who": "Who Benefits",
          "choose": "Why We Stand Out"
        },
        "why": {
          "title": "Why Choose FitoutHub",
          "description": "The complete platform for renovation projects",
          "secure": {
            "title": "Secure Payments",
            "description": "Protected escrow system for all transactions"
          },
          "contracts": {
            "title": "Smart Contracts",
            "description": "Transparent agreements with all parties"
          },
          "oversight": {
            "title": "Project Oversight",
            "description": "Track every milestone and delivery"
          },
          "collaboration": {
            "title": "Real Collaboration",
            "description": "Unified communication platform"
          }
        },
        "how": {
          "title": "How It Works",
          "description": "Simple steps to get your project started",
          "plan": {
            "title": "Create Your Plan",
            "description": "Define your project scope and budget"
          },
          "match": {
            "title": "Find Matches",
            "description": "Connect with qualified professionals"
          },
          "manage": {
            "title": "Manage Together",
            "description": "Collaborate in real-time"
          },
          "complete": {
            "title": "Complete Your Project",
            "description": "Track progress and complete your renovation with confidence"
          }
        },
        "who": {
          "title": "Who Benefits",
          "clients": {
            "title": "For Clients",
            "description": "Manage your renovation project with ease and transparency"
          },
          "contractors": {
            "title": "For Contractors",
            "description": "Find quality leads and grow your business"
          },
          "suppliers": {
            "title": "For Suppliers",
            "description": "Connect with projects and expand your reach"
          },
          "designers": {
            "title": "For Designers",
            "description": "Collaborate seamlessly on renovation projects"
          }
        },
        "choose": {
          "title": "Why We Stand Out",
          "description": "Features that make FitoutHub the best choice",
          "pm": {
            "title": "Project Management",
            "description": "Comprehensive tools to manage every aspect of your renovation"
          },
          "communication": {
            "title": "Clear Communication",
            "description": "Stay connected with all stakeholders in real-time"
          },
          "platform": {
            "title": "All-in-One Platform",
            "description": "Everything you need in one place"
          },
          "risk": {
            "title": "Risk Protection",
            "description": "Secure payments and verified professionals"
          }
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
    },
    "profile": {
      "client": {
        "title": "My Profile",
        "subtitle": "Manage your account details and settings",
        "accountInfo": "Account Information",
        "email": "Email",
        "firstName": "First Name",
        "surname": "Surname",
        "newPassword": "New Password",
        "passwordHint": "Minimum 6 characters",
        "passwordNote": "Leave blank to keep your current password",
        "saveChanges": "Save Changes",
        "saving": "Saving...",
        "defaultLocation": "Default Location",
        "defaultLocationHint": "Set your preferred location to prefill searches for trades and professionals.",
        "saveDefaultLocation": "Save Default Location",
        "locationSaved": "Location saved.",
        "accountDetails": "Account Details",
        "accountType": "Account Type",
        "userId": "User ID",
        "logout": "Logout"
      },
      "professional": {
        "title": "Professional Profile",
        "subtitle": "Manage your business information and settings",
        "businessInfo": "Business Information",
        "businessName": "Business Name",
        "fullName": "Full Name",
        "phone": "Phone",
        "professionType": "Profession Type",
        "email": "Email",
        "serviceArea": "Service Area",
        "primaryLocation": "Primary Location",
        "secondaryLocation": "Secondary Location",
        "tertiaryLocation": "Tertiary Location",
        "tradesOffered": "Trades Offered",
        "suppliesOffered": "Supplies Offered",
        "primaryTrade": "Primary Trade",
        "referenceProjects": "Reference Projects",
        "portfolioImages": "Portfolio Images",
        "addReferenceProject": "Add Reference Project",
        "projectTitle": "Project Title",
        "projectDescription": "Project Description",
        "projectImages": "Project Images",
        "saveProfile": "Save Profile",
        "saving": "Saving...",
        "updateSuccess": "Profile updated successfully",
        "password": "Password",
        "changePassword": "Change Password",
        "confirmPassword": "Confirm Password",
        "logout": "Logout"
      }
    },
    "professionType": {
      "contractor": "Sole Trader / Individual Contractor",
      "contractorDesc": "Register as an independent professional or sole proprietor",
      "company": "Service Company",
      "companyDesc": "Register your company providing construction or renovation services",
      "reseller": "Reseller / Supplier",
      "resellerDesc": "Register your business as a supplier or reseller",
      "joinAsProfessional": "Join as a Professional",
      "selectProfession": "Select the type of professional profile that best describes your business.",
      "continue": "Continue",
      "cancel": "Cancel"
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
      "join": {
        "title": "加入 Fitout Hub",
        "subtitle": "選擇您想如何開始",
        "clientTitle": "以客戶身份加入",
        "clientDescription": "為您的裝修項目尋找專業人士。發佈項目並獲取已認證承辦商報價。",
        "professionalTitle": "以專業人士身份加入",
        "professionalDescription": "註冊您的業務並連結客戶。投標項目並擴展客戶群。"
      },
      "login": {
        "title": "登入",
        "email": "電郵地址",
        "password": "密碼",
        "submit": "登入",
        "noAccount": "還未有帳戶?",
        "forgotPassword": "忘記密碼?",
        "success": "歡迎返回!",
        "welcome": "歡迎來到 Fitout Hub",
        "clientLabel": "客戶",
        "professionalLabel": "專業人士",
        "professionalText": "專業人士帳戶？",
        "homePage": "首頁",
        "contactUs": "聯絡我們"
      },
      "signup": {
        "title": "建立帳戶",
        "intro": "開始您的裝修項目",
        "username": "用戶名稱",
        "firstName": "名字",
        "lastName": "姓氏",
        "email": "電郵",
        "mobile": "手機",
        "password": "密碼",
        "confirmPassword": "確認密碼",
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
          },
          "complete": {
            "title": "完成您的項目",
            "description": "追蹤進度，有信心地完成您的裝修"
          }
        },
        "who": {
          "title": "我們是誰",
          "description": "用技術改造裝修行業",
          "clients": {
            "title": "客戶",
            "description": "輕鬆透明地管理您的裝修項目"
          },
          "contractors": {
            "title": "承包商",
            "description": "找到優質業務機會並擴展您的客戶群"
          },
          "suppliers": {
            "title": "供應商",
            "description": "與項目聯繫並擴展您的商業範圍"
          },
          "designers": {
            "title": "設計師",
            "description": "在裝修項目中無縫協作"
          }
        },
        "choose": {
          "title": "為什麼選擇Fitout Hub？",
          "description": "加入數百名滿意的客戶和專業人士",
          "pm": {
            "title": "項目管理",
            "description": "管理您裝修每個方面的綜合工具"
          },
          "communication": {
            "title": "清晰溝通",
            "description": "與所有利益相關者實時保持聯繫"
          },
          "platform": {
            "title": "一體化平台",
            "description": "您所需的一切都在一個地方"
          },
          "risk": {
            "title": "風險保護",
            "description": "安全付款和認證專業人士"
          }
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
    },
    "profile": {
      "client": {
        "title": "我的檔案",
        "subtitle": "管理您的帳戶詳情和設置",
        "accountInfo": "帳戶資訊",
        "email": "電郵",
        "firstName": "名字",
        "surname": "姓氏",
        "newPassword": "新密碼",
        "passwordHint": "最少 6 個字元",
        "passwordNote": "留空以保持您目前的密碼",
        "saveChanges": "保存變更",
        "saving": "保存中...",
        "defaultLocation": "預設位置",
        "defaultLocationHint": "設定您的首選位置以預填裝修工人和專業人士的搜尋。",
        "saveDefaultLocation": "保存預設位置",
        "locationSaved": "位置已保存。",
        "accountDetails": "帳戶詳情",
        "accountType": "帳戶類型",
        "userId": "用戶 ID",
        "logout": "登出"
      },
      "professional": {
        "title": "專業人士檔案",
        "subtitle": "管理您的業務資訊和設置",
        "businessInfo": "業務資訊",
        "businessName": "業務名稱",
        "fullName": "全名",
        "phone": "電話",
        "professionType": "專業類型",
        "email": "電郵",
        "serviceArea": "服務範圍",
        "primaryLocation": "主要位置",
        "secondaryLocation": "次要位置",
        "tertiaryLocation": "第三位置",
        "tradesOffered": "提供的行業",
        "suppliesOffered": "提供的供應品",
        "primaryTrade": "主要行業",
        "referenceProjects": "參考項目",
        "portfolioImages": "作品集圖片",
        "addReferenceProject": "新增參考項目",
        "projectTitle": "項目名稱",
        "projectDescription": "項目描述",
        "projectImages": "項目圖片",
        "saveProfile": "保存檔案",
        "saving": "保存中...",
        "updateSuccess": "檔案已成功更新",
        "password": "密碼",
        "changePassword": "更改密碼",
        "confirmPassword": "確認密碼",
        "logout": "登出"
      }
    },
    "professionType": {
      "contractor": "獨資企業 / 個人承包商",
      "contractorDesc": "以獨立專業人士或獨資企業主身份登記",
      "company": "服務公司",
      "companyDesc": "登記您提供建築或裝修服務的公司",
      "reseller": "轉售商 / 供應商",
      "resellerDesc": "將您的業務登記為供應商或轉售商",
      "joinAsProfessional": "以專業人士身份加入",
      "selectProfession": "選擇最能描述您業務的專業檔案類型。",
      "continue": "繼續",
      "cancel": "取消"
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
