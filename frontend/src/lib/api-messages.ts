import type { Language } from "./language";

export const apiMessages: Record<
  Language,
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
  en: {
    genericError: "Something went wrong. Try again later.",
    connectionError: "Can’t reach the server. Check the connection and try again.",
    csrfExpired: "The page check expired. Submit again.",
    invalidField: "Check this field.",
  },
};

// The server writes its messages in Chinese, so Italian and English pages translate the error codes
// that store and platform pages can receive. Codes missing here fall back to the generic message.
export const errorTranslations: Record<Exclude<Language, "zh">, Record<string, string>> = {
  it: {
    ACCOUNT_CHANGED: "L’account è cambiato. Ricarica e verifica di nuovo.",
    ACCOUNT_NOT_FOUND: "L’account non esiste o non appartiene a questo ristorante.",
    ALLERGEN_REVIEW_REQUIRED:
      "Il titolare deve prima modificare il piatto e verificarne gli allergeni.",
    BILL_CHANGED: "Il conto è cambiato. Ricontrolla tavolo, importo e ordini.",
    BILL_LIMIT_REACHED: "Il conto ha raggiunto il limite supportato. Contatta l’amministratore.",
    CATEGORY_NOT_EMPTY: "Sposta o elimina prima i piatti della categoria.",
    CREATE_CONFLICT:
      "Identificativo del ristorante o nome utente già in uso: controlla il risultato originale o cambia il nome utente.",
    CREDENTIALS_CHANGED: "Le credenziali sono cambiate. Accedi di nuovo.",
    CURRENT_PASSWORD_INCORRECT: "La password attuale non è corretta.",
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
    RESTAURANT_EXISTS:
      "Questo identificativo di creazione esiste già: controlla il ristorante originale.",
    RESTAURANT_NOT_FOUND: "Il ristorante non esiste.",
    RESTAURANT_NOT_SUSPENDED: "Sospendi prima il servizio del ristorante, poi eliminalo.",
    SERVICE_SUSPENDED: "Il servizio del ristorante è sospeso.",
    SESSION_ALREADY_ACTIVE: "Il tavolo è già aperto. Ricarica lo stato attuale.",
    SESSION_CLOSED: "Questa visita è già chiusa.",
    SESSION_HAS_ORDERS: "Questa visita ha ordini: non si può chiudere come tavolo vuoto.",
    SESSION_NOT_FOUND: "Visita inesistente.",
    SESSION_NOT_PAYABLE:
      "Un conto a zero si chiude come tavolo vuoto o annullato, non come incassato.",
    SESSION_NOT_VOIDABLE:
      "Si chiude a zero solo se ci sono ordini e tutti i piatti sono annullati.",
    SUBSCRIPTION_CHANGED:
      "I dati dell’abbonamento sono cambiati (forse per questa o un’altra operazione). Controlla i dati aggiornati e conferma di nuovo.",
    SUBSCRIPTION_PERIOD_EXISTS:
      "Questo identificativo di periodo è già usato: controlla il periodo originale.",
    SUBSCRIPTION_PERIOD_NOT_FOUND: "Il periodo non esiste o non appartiene a questo ristorante.",
    SUBSCRIPTION_PERIOD_OVERLAP:
      "I periodi non possono sovrapporsi: controlla le date di inizio e di fine.",
    SUBSCRIPTION_PERIOD_PAID:
      "Il periodo risulta già pagato: importo e pagamento non si modificano più, solo la scadenza.",
    TABLE_DISABLED: "Questo tavolo è disattivato.",
    TABLE_HAS_ACTIVE_SESSION: "Il tavolo ha una visita in corso: chiudila prima di eliminarlo.",
    TABLE_LABEL_CONFLICT: "Esiste già un tavolo con questo nome.",
    TABLE_NOT_FOUND: "Tavolo inesistente. Aggiorna la lista.",
    UNAUTHENTICATED: "Accedi prima di continuare.",
    VALIDATION_FAILED: "Controlla i dati inseriti.",
  },
  en: {
    ACCOUNT_CHANGED: "The account has changed. Reload and check again.",
    ACCOUNT_NOT_FOUND: "The account doesn’t exist or doesn’t belong to this restaurant.",
    ALLERGEN_REVIEW_REQUIRED: "The owner must first edit the dish and review its allergens.",
    BILL_CHANGED: "The bill has changed. Check the table, amount and orders again.",
    BILL_LIMIT_REACHED: "The bill has reached the supported limit. Contact the administrator.",
    CATEGORY_NOT_EMPTY: "Move or delete the dishes in this category first.",
    CREATE_CONFLICT:
      "Restaurant ID or username already in use: check the original result or change the username.",
    CREDENTIALS_CHANGED: "Your credentials have changed. Sign in again.",
    CURRENT_PASSWORD_INCORRECT: "The current password is wrong.",
    FORBIDDEN: "You don’t have permission for this.",
    IMAGE_INVALID: "Can’t read the image. Upload a JPG, PNG or WebP photo.",
    IMAGE_TOO_LARGE: "Image too large: upload a photo up to 15 MB (about 50 megapixels).",
    INVALID_CREDENTIALS: "Wrong username or password.",
    ITEM_CODE_CONFLICT: "Another dish already uses this code.",
    MENU_IMAGE_NOT_FOUND: "The image doesn’t exist.",
    MENU_RESOURCE_NOT_FOUND: "Category or dish not found. Refresh the menu.",
    ORDERS_PENDING: "Some dishes are still waiting: finish them in the kitchen or cancel them.",
    ORDER_ITEM_CHANGED: "The dish status has changed. Reload and check.",
    ORDER_ITEM_NOT_FOUND: "The ordered dish doesn’t exist.",
    ORDER_NOT_FOUND: "The order doesn’t exist.",
    PASSWORD_CHANGE_REQUIRED: "Change the initial password first.",
    PASSWORD_UNCHANGED: "The new password must differ from the current one.",
    RATE_LIMITED: "Too many attempts. Try again shortly.",
    RESTAURANT_EXISTS: "This creation ID already exists: check the original restaurant.",
    RESTAURANT_NOT_FOUND: "The restaurant doesn’t exist.",
    RESTAURANT_NOT_SUSPENDED: "Suspend the restaurant’s service first, then delete it.",
    SERVICE_SUSPENDED: "The restaurant’s service is suspended.",
    SESSION_ALREADY_ACTIVE: "The table is already open. Reload the current state.",
    SESSION_CLOSED: "This visit is already closed.",
    SESSION_HAS_ORDERS: "This visit has orders: it can’t be closed as an empty table.",
    SESSION_NOT_FOUND: "Visit not found.",
    SESSION_NOT_PAYABLE: "A zero bill closes as an empty or voided table, not as paid.",
    SESSION_NOT_VOIDABLE:
      "A bill closes at zero only if it has orders and every dish is cancelled.",
    SUBSCRIPTION_CHANGED:
      "The subscription has changed (perhaps by this or another action). Check the latest data and confirm again.",
    SUBSCRIPTION_PERIOD_EXISTS: "This period ID is already used: check the original period.",
    SUBSCRIPTION_PERIOD_NOT_FOUND: "The period doesn’t exist or doesn’t belong to this restaurant.",
    SUBSCRIPTION_PERIOD_OVERLAP: "Periods can’t overlap: check the start and end dates.",
    SUBSCRIPTION_PERIOD_PAID:
      "This period is already paid: its amount and payment are frozen, only its end date can change.",
    TABLE_DISABLED: "This table is disabled.",
    TABLE_HAS_ACTIVE_SESSION: "The table has an open visit: close it before deleting the table.",
    TABLE_LABEL_CONFLICT: "A table with this name already exists.",
    TABLE_NOT_FOUND: "Table not found. Refresh the list.",
    UNAUTHENTICATED: "Sign in to continue.",
    VALIDATION_FAILED: "Check the data you entered.",
  },
};
