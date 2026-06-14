function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export type LegalBusinessInfo = {
  sellerName: string;
  representative: string;
  address: string;
  phone: string;
  email: string;
  /** 所在地の遅延開示に関する特記（任意） */
  addressDisclosureNote: string;
};

/** 特定商取引法表記用の事業者情報（未設定時は空欄） */
export function readLegalBusinessInfo(): LegalBusinessInfo {
  return {
    sellerName: env("LEGAL_SELLER_NAME"),
    representative: env("LEGAL_REPRESENTATIVE"),
    address: env("LEGAL_ADDRESS"),
    phone: env("LEGAL_PHONE"),
    email: env("LEGAL_EMAIL"),
    addressDisclosureNote: env("LEGAL_ADDRESS_DISCLOSURE_NOTE"),
  };
}

export function legalCell(value: string): string {
  return value.trim();
}
