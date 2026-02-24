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
      "projects": "Projects",
      "professionals": "Professionals",
      "profile": "Profile",
      "logout": "Logout",
      "login": "Login",
      "signup": "Sign Up",
      "admin": "Admin",
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
      "projects": "項目",
      "professionals": "專業人士",
      "profile": "個人資料",
      "logout": "登出",
      "login": "登入",
      "signup": "註冊",
      "admin": "管理員",
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
  };
});
