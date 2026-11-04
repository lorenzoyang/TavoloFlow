import type { Language } from "@/lib/language";

// Account management copy, shared by the platform pages and the OWNER's staff account page
// (/staff/settings); both follow the device's interface language.
const zh = {
  damaged: "待确认记录无法读取，请先联系管理员核对，当前页面暂停写入。",
  recoveredCreate: "已查到餐厅。初始密码无法再次读取，请进入餐厅详情，核对后重新重置账号密码。",
  recoveredRestaurant: "已重新读取餐厅状态，请核对。后续修改需要重新人工确认。",
  recoveredMissing: "目标已不存在（可能已被删除），已清除待确认记录。",
  recoveredAccount: (changed: boolean) =>
    `${changed ? "账号凭据版本已变化；可能来自本次操作或其他管理员的修改。" : "账号凭据版本尚未变化，原请求仍可能到达。"}临时密码无法再次读取；如需重置，请核对最新状态后重新人工确认。`,
  missingCreate:
    "暂未查到原餐厅，旧请求仍可能到达。可重新填写并人工确认创建；系统会沿用原创建编号。",
  recoverUnknown: "仍无法核对结果，请恢复网络后重新读取。",
  storageBlocked: "浏览器无法保存待确认标识，尚未发送修改。请允许此站点的标签页存储。",
  done: "操作已完成，请核对当前状态。",
  writeUnknown: "操作结果待确认。恢复后只查询状态，不会自动重发修改。",
  // Temporary passwords and account cards.
  passwordsTitle: "请安全交付临时密码",
  passwordsHint: "仅本次展示。关闭、离开或隐藏页面后无法再次查看；首次登录必须修改密码。",
  copied: "已复制，请通过安全渠道交付。",
  copyFailed: "无法自动复制，请选中文字手动复制。",
  copyPassword: (role: string) => `复制 ${role} 临时密码`,
  closePasswords: "已保存，关闭密码展示",
  active: "账号已启用",
  inactive: "账号已禁用",
  mustChange: "登录后须修改临时密码",
  changed: "已完成改密",
  reset: (role: string) => `重置 ${role} 密码`,
  toggle: (active: boolean, role: string) => `${active ? "禁用" : "启用"} ${role} 账号`,
  // The OWNER's staff account page.
  staffTitle: "员工账号",
  staffDescription: (restaurant: string) => `${restaurant} · 店里所有员工设备共用这个 STAFF 账号。`,
  refreshStaff: "刷新员工账号",
  loadingStaff: "正在读取员工账号…",
  verify: "查询原操作结果",
  resetTitle: "确认重置员工密码",
  resetHint: (restaurant: string, username: string) =>
    `${restaurant} · ${username}：重置后所有员工设备须重新登录，并修改临时密码。`,
  confirmReset: "确认重置",
  accountChanged: "账号已变化，请取消后重新核对。",
  ownerOnly: "仅老板可以管理员工密码。",
};

export const managementMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    damaged:
      "Impossibile leggere le operazioni in sospeso: contatta l’amministratore. Su questa pagina le modifiche sono sospese.",
    recoveredCreate:
      "Ristorante trovato. Le password iniziali non si possono rileggere: aprilo e reimposta le password.",
    recoveredRestaurant:
      "Stato del ristorante ricaricato: controllalo. Ogni nuova modifica va confermata di nuovo.",
    recoveredMissing:
      "Elemento non più presente (forse eliminato): l’operazione in sospeso è stata archiviata.",
    recoveredAccount: (changed) =>
      `${changed ? "Le credenziali dell’account sono cambiate, per questa operazione o per un’altra modifica." : "Le credenziali non sono ancora cambiate: la richiesta originale potrebbe ancora arrivare."} La password temporanea non si può rileggere; per reimpostarla controlla lo stato attuale e conferma di nuovo.`,
    missingCreate:
      "Ristorante non ancora trovato: la richiesta originale potrebbe ancora arrivare. Puoi compilare di nuovo e confermare; verrà usato lo stesso identificativo.",
    recoverUnknown: "Esito ancora non verificabile: ricarica quando torna la connessione.",
    storageBlocked:
      "Il browser non può salvare l’operazione in sospeso, quindi la modifica non è stata inviata. Consenti l’archiviazione per questo sito.",
    done: "Operazione completata: controlla lo stato attuale.",
    writeUnknown:
      "Esito da verificare: al ritorno della connessione si rilegge solo lo stato, senza reinviare la modifica.",
    passwordsTitle: "Consegna la password temporanea in modo sicuro",
    passwordsHint:
      "È visibile solo ora: chiudendo, lasciando o nascondendo la pagina non si potrà più vedere. Al primo accesso va cambiata.",
    copied: "Copiata: consegnala tramite un canale sicuro.",
    copyFailed: "Copia automatica non disponibile: seleziona il testo e copialo.",
    copyPassword: (role) => `Copia password ${role}`,
    closePasswords: "Salvata, nascondi la password",
    active: "Account attivo",
    inactive: "Account disattivato",
    mustChange: "Password temporanea da cambiare",
    changed: "Password già cambiata",
    reset: (role) => `Reimposta password ${role}`,
    toggle: (active, role) => `${active ? "Disattiva" : "Attiva"} account ${role}`,
    staffTitle: "Account staff",
    staffDescription: (restaurant) =>
      `${restaurant} · Tutti i dispositivi dello staff usano questo account STAFF.`,
    refreshStaff: "Aggiorna account staff",
    loadingStaff: "Caricamento dell’account staff…",
    verify: "Verifica l’esito",
    resetTitle: "Reimposta la password dello staff",
    resetHint: (restaurant, username) =>
      `${restaurant} · ${username}: dopo la reimpostazione tutti i dispositivi dello staff dovranno accedere di nuovo e cambiare la password temporanea.`,
    confirmReset: "Reimposta",
    accountChanged: "L’account è cambiato: annulla e verifica di nuovo.",
    ownerOnly: "Solo il titolare può gestire la password dello staff.",
  },
  en: {
    damaged:
      "Can’t read the pending actions: contact the administrator. Changes are paused on this page.",
    recoveredCreate:
      "Restaurant found. The initial passwords can’t be read again: open it and reset the passwords.",
    recoveredRestaurant:
      "Restaurant status reloaded: check it. Every new change must be confirmed again.",
    recoveredMissing: "No longer there (perhaps deleted): the pending action was cleared.",
    recoveredAccount: (changed) =>
      `${changed ? "The account’s credentials have changed, by this action or another change." : "The credentials haven’t changed yet: the original request may still arrive."} The temporary password can’t be read again; to reset it, check the current state and confirm again.`,
    missingCreate:
      "Restaurant not found yet: the original request may still arrive. You can fill in the form again and confirm; the same ID will be used.",
    recoverUnknown: "Result still can’t be checked: reload when the connection is back.",
    storageBlocked:
      "The browser can’t save the pending action, so the change wasn’t sent. Allow storage for this site.",
    done: "Done: check the current state.",
    writeUnknown:
      "Result to check: when the connection is back, only the state is read again; the change isn’t resent.",
    passwordsTitle: "Hand over the temporary password safely",
    passwordsHint:
      "Shown only now: once you close, leave or hide the page it can’t be seen again. It must be changed at first sign-in.",
    copied: "Copied: hand it over through a safe channel.",
    copyFailed: "Automatic copy unavailable: select the text and copy it.",
    copyPassword: (role) => `Copy ${role} password`,
    closePasswords: "Saved, hide the password",
    active: "Account enabled",
    inactive: "Account disabled",
    mustChange: "Temporary password to change",
    changed: "Password changed",
    reset: (role) => `Reset ${role} password`,
    toggle: (active, role) => `${active ? "Disable" : "Enable"} ${role} account`,
    staffTitle: "Staff account",
    staffDescription: (restaurant) => `${restaurant} · Every staff device uses this STAFF account.`,
    refreshStaff: "Refresh staff account",
    loadingStaff: "Loading the staff account…",
    verify: "Check the result",
    resetTitle: "Reset the staff password",
    resetHint: (restaurant, username) =>
      `${restaurant} · ${username}: after the reset, every staff device must sign in again and change the temporary password.`,
    confirmReset: "Reset",
    accountChanged: "The account has changed: cancel and check again.",
    ownerOnly: "Only the owner can manage the staff password.",
  },
};
