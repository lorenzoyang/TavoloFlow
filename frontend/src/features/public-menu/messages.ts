import type { Language } from "@/lib/language";

type Messages = {
  menu: string;
  table: string;
  languages: string;
  all: string;
  soldOut: string;
  loading: string;
  empty: string;
  emptyCategory: string;
  invalid: string;
  retry: string;
  error: string;
  stale: string;
  suspended: string;
  disabled: string;
  paused: string;
  order: string;
  unopened: string;
  allergens: string;
  unreviewed: string;
  reviewedEmpty: string;
  allergyHint: string;
  scanToOrder: string;
  sourceCode: string;
};

export const languageLabels: Record<Language, string> = {
  zh: "中文",
  it: "Italiano",
  en: "English",
};
export const messages: Record<Language, Messages> = {
  zh: {
    menu: "菜单",
    table: "桌号",
    languages: "选择语言",
    all: "全部",
    soldOut: "已售罄",
    loading: "正在读取菜单…",
    empty: "餐厅暂未提供菜品，请咨询服务员。",
    emptyCategory: "这个分类暂时没有菜品。",
    invalid: "二维码无效或桌位已移除，请联系餐厅工作人员。",
    retry: "重新读取菜单",
    error: "暂时无法读取菜单，请检查网络后重试。",
    stale: "菜单更新失败，当前显示上次读取的内容。请重新读取或向服务员确认。",
    suspended: "本餐厅暂未开放扫码点餐，您仍可浏览菜单；如需点餐请联系服务员。",
    disabled: "此桌暂时停用，您仍可浏览菜单。",
    paused: "餐厅暂未接受扫码订单。",
    order: "可先编辑购物车；加入本轮用餐并核对订单后提交。",
    unopened: "此桌尚未开桌，可先编辑购物车，请联系服务员开桌。",
    allergens: "过敏原",
    unreviewed: "过敏原信息待餐厅确认，请咨询服务员。",
    reviewedEmpty: "餐厅已审核，未识别出需声明的过敏原。",
    allergyHint: "如有食物过敏，请告知餐厅。过敏原信息不代表不存在交叉接触风险。",
    scanToOrder: "扫码点餐",
    sourceCode: "源代码（AGPL-3.0）",
  },
  it: {
    menu: "Menu",
    table: "Tavolo",
    languages: "Scegli la lingua",
    all: "Tutto",
    soldOut: "Esaurito",
    loading: "Caricamento del menu…",
    empty: "Nessun piatto disponibile nel menu. Rivolgiti al personale.",
    emptyCategory: "Questa categoria non contiene ancora piatti.",
    invalid: "Codice QR non valido o tavolo rimosso. Rivolgiti al personale.",
    retry: "Aggiorna il menu",
    error: "Impossibile caricare il menu. Controlla la connessione e riprova.",
    stale:
      "Aggiornamento non riuscito: stai vedendo il menu precedente. Riprova o chiedi al personale.",
    suspended:
      "Gli ordini tramite QR non sono ancora disponibili in questo ristorante. Puoi comunque consultare il menu; per ordinare rivolgiti al personale.",
    disabled: "Questo tavolo è disabilitato. Puoi comunque consultare il menu.",
    paused: "Il ristorante non accetta ordini tramite QR al momento.",
    order: "Prepara il carrello, unisciti al tavolo e controlla l’ordine prima di inviarlo.",
    unopened:
      "Il tavolo non è ancora aperto. Puoi preparare il carrello e chiedere al personale di aprirlo.",
    allergens: "Allergeni",
    unreviewed: "Informazioni sugli allergeni in attesa di conferma. Chiedi al personale.",
    reviewedEmpty:
      "Il ristorante ha verificato il piatto e non ha identificato allergeni da dichiarare.",
    allergyHint:
      "In caso di allergie alimentari, informa il personale. Le informazioni sugli allergeni non escludono il rischio di contaminazione crociata.",
    scanToOrder: "Scansiona per ordinare",
    sourceCode: "Codice sorgente (AGPL-3.0)",
  },
  en: {
    menu: "Menu",
    table: "Table",
    languages: "Choose language",
    all: "All",
    soldOut: "Sold out",
    loading: "Loading menu…",
    empty: "No dishes have been added yet. Please ask the staff.",
    emptyCategory: "There are no dishes in this category yet.",
    invalid: "This QR code is invalid or the table has been removed. Please ask the staff.",
    retry: "Refresh menu",
    error: "Unable to load the menu. Check your connection and try again.",
    stale:
      "The menu could not be updated. You are viewing an earlier version. Refresh or check with the staff.",
    suspended:
      "QR ordering isn’t available at this restaurant yet. You can still browse the menu; please ask the staff to order.",
    disabled: "This table is disabled. You can still browse the menu.",
    paused: "The restaurant is not accepting QR orders at the moment.",
    order: "Prepare your cart, join this visit, then review and place your order.",
    unopened: "This table is not open yet. You can prepare your cart and ask staff to open it.",
    allergens: "Allergens",
    unreviewed: "Allergen information is awaiting confirmation. Please ask the staff.",
    reviewedEmpty: "Reviewed by the restaurant; no declarable allergens identified.",
    allergyHint:
      "Tell the staff about any food allergies. Allergen information does not exclude the risk of cross-contact.",
    scanToOrder: "Scan to order",
    sourceCode: "Source code (AGPL-3.0)",
  },
};

export const allergenNames: Record<Language, Record<string, string>> = {
  zh: {
    GLUTEN: "含麸质谷物",
    CRUSTACEANS: "甲壳类",
    EGGS: "蛋",
    FISH: "鱼",
    PEANUTS: "花生",
    SOY: "大豆",
    MILK: "奶（含乳糖）",
    NUTS: "坚果",
    CELERY: "芹菜",
    MUSTARD: "芥末",
    SESAME: "芝麻",
    SULPHITES: "二氧化硫及亚硫酸盐",
    LUPIN: "羽扇豆",
    MOLLUSCS: "软体动物",
  },
  it: {
    GLUTEN: "Cereali contenenti glutine",
    CRUSTACEANS: "Crostacei",
    EGGS: "Uova",
    FISH: "Pesce",
    PEANUTS: "Arachidi",
    SOY: "Soia",
    MILK: "Latte (incluso lattosio)",
    NUTS: "Frutta a guscio",
    CELERY: "Sedano",
    MUSTARD: "Senape",
    SESAME: "Sesamo",
    SULPHITES: "Anidride solforosa e solfiti",
    LUPIN: "Lupini",
    MOLLUSCS: "Molluschi",
  },
  en: {
    GLUTEN: "Cereals containing gluten",
    CRUSTACEANS: "Crustaceans",
    EGGS: "Eggs",
    FISH: "Fish",
    PEANUTS: "Peanuts",
    SOY: "Soy",
    MILK: "Milk (including lactose)",
    NUTS: "Tree nuts",
    CELERY: "Celery",
    MUSTARD: "Mustard",
    SESAME: "Sesame",
    SULPHITES: "Sulphur dioxide and sulphites",
    LUPIN: "Lupin",
    MOLLUSCS: "Molluscs",
  },
};
