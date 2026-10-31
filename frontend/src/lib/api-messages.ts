import type { StaffLanguage } from "./staff-language";

export const apiMessages: Record<
  StaffLanguage,
  { genericError: string; connectionError: string; csrfExpired: string; invalidField: string }
> = {
  zh: {
    genericError: "操作未完成，请稍后重试。",
    connectionError: "暂时无法连接服务器，请检查网络后重试。",
    csrfExpired: "页面验证已失效，请再次提交。",
    invalidField: "请检查此项。",
  },
  it: {
    genericError: "Operazione non riuscita. Riprova più tardi.",
    connectionError: "Server non raggiungibile. Controlla la connessione e riprova.",
    csrfExpired: "La verifica della pagina è scaduta. Invia di nuovo.",
    invalidField: "Controlla questo campo.",
  },
};

// The server writes its messages in Chinese, so Italian pages translate the error codes a store page
// can receive. Codes missing here fall back to the generic message.
export const italianErrors: Record<string, string> = {
  ACCOUNT_CHANGED: "L’account è cambiato. Ricarica e verifica di nuovo.",
  ACCOUNT_NOT_FOUND: "L’account non esiste o non appartiene a questo ristorante.",
  ALLERGEN_REVIEW_REQUIRED:
    "Il titolare deve prima modificare il piatto e verificarne gli allergeni.",
  BILL_CHANGED: "Il conto è cambiato. Ricontrolla tavolo, importo e ordini.",
  BILL_LIMIT_REACHED: "Il conto ha raggiunto il limite supportato. Contatta l’amministratore.",
  CATEGORY_NOT_EMPTY: "Sposta o elimina prima i piatti della categoria.",
  CREDENTIALS_CHANGED: "Le credenziali sono cambiate. Accedi di nuovo.",
  CURRENT_PASSWORD_INCORRECT: "La password attuale non è corretta.",
  DINE_IN_NOT_OFFERED: "Il ristorante non offre il servizio al tavolo.",
  FORBIDDEN: "Non hai i permessi per questa operazione.",
  IMAGE_INVALID: "Impossibile leggere l’immagine. Carica una foto JPG, PNG o WebP.",
  IMAGE_TOO_LARGE: "Immagine troppo grande: carica una foto fino a 15 MB (circa 50 megapixel).",
  INVALID_CREDENTIALS: "Nome utente o password non corretti.",
  ITEM_CODE_CONFLICT: "Questo codice è già usato da un altro piatto.",
  MENU_IMAGE_NOT_FOUND: "L’immagine non esiste.",
  MENU_RESOURCE_NOT_FOUND: "Categoria o piatto inesistente. Aggiorna il menu.",
  ORDERS_PENDING: "Ci sono piatti ancora da preparare: completali in cucina o annullali.",
  ORDER_ITEM_CHANGED: "Lo stato del piatto è cambiato. Ricarica e verifica.",
  ORDER_ITEM_NOT_FOUND: "Il piatto dell’ordine non esiste.",
  ORDER_NOT_FOUND: "L’ordine non esiste.",
  PASSWORD_CHANGE_REQUIRED: "Cambia prima la password iniziale.",
  PASSWORD_UNCHANGED: "La nuova password deve essere diversa da quella attuale.",
  RATE_LIMITED: "Troppi tentativi. Riprova tra poco.",
  SERVICE_SUSPENDED: "Il servizio del ristorante è sospeso.",
  SESSION_ALREADY_ACTIVE: "Il tavolo è già aperto. Ricarica lo stato attuale.",
  SESSION_CLOSED: "Questa visita è già chiusa.",
  SESSION_HAS_ORDERS: "Questa visita ha ordini: non si può chiudere come tavolo vuoto.",
  SESSION_NOT_FOUND: "Visita inesistente.",
  SESSION_NOT_PAYABLE:
    "Un conto a zero si chiude come tavolo vuoto o annullato, non come incassato.",
  SESSION_NOT_VOIDABLE: "Si chiude a zero solo se ci sono ordini e tutti i piatti sono annullati.",
  TABLE_DISABLED: "Questo tavolo è disattivato.",
  TABLE_HAS_ACTIVE_SESSION: "Il tavolo ha una visita in corso: chiudila prima di eliminarlo.",
  TABLE_LABEL_CONFLICT: "Esiste già un tavolo con questo nome.",
  TABLE_NOT_FOUND: "Tavolo inesistente. Aggiorna la lista.",
  UNAUTHENTICATED: "Accedi prima di continuare.",
  VALIDATION_FAILED: "Controlla i dati inseriti.",
};
