// GENERE par scripts/build-locales.js depuis config/markets.json - ne pas modifier a la main.
export type IntervalKey = "week" | "month" | "year";
export type PriceRow = { unitAmount: number; envKey: string; legacyEnvKey: string | null; priceId: string | null };
export const PRO_INTERVALS: IntervalKey[] = ["week","month","year"];
export const PRO_DEFAULT_INTERVAL: IntervalKey = "month";
export const PRO_PRICES: Record<string, { currency: string; intervals: Partial<Record<IntervalKey, PriceRow>> }> = {
  "fr": {
    "currency": "EUR",
    "intervals": {
      "week": {
        "unitAmount": 699,
        "envKey": "STRIPE_PRICE_ID_FR_WEEK",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKzCz0CerLuxwrFe5hklH"
      },
      "month": {
        "unitAmount": 1995,
        "envKey": "STRIPE_PRICE_ID_FR_MONTH",
        "legacyEnvKey": "STRIPE_PRICE_ID",
        "priceId": "price_1UB7tpCz0CerLuxwNxsTsMRM"
      },
      "year": {
        "unitAmount": 19900,
        "envKey": "STRIPE_PRICE_ID_FR_YEAR",
        "legacyEnvKey": null,
        "priceId": "price_1UHPL0Cz0CerLuxw26Kh72BF"
      }
    }
  },
  "gb": {
    "currency": "GBP",
    "intervals": {
      "week": {
        "unitAmount": 499,
        "envKey": "STRIPE_PRICE_ID_GB_WEEK",
        "legacyEnvKey": null,
        "priceId": null
      },
      "month": {
        "unitAmount": 1499,
        "envKey": "STRIPE_PRICE_ID_GB_MONTH",
        "legacyEnvKey": null,
        "priceId": "price_1UHPIRCz0CerLuxwwMv0zpmY"
      },
      "year": {
        "unitAmount": 14900,
        "envKey": "STRIPE_PRICE_ID_GB_YEAR",
        "legacyEnvKey": null,
        "priceId": null
      }
    }
  },
  "mx": {
    "currency": "MXN",
    "intervals": {
      "week": {
        "unitAmount": 6900,
        "envKey": "STRIPE_PRICE_ID_MX_WEEK",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKuCz0CerLuxwIFBrhhxf"
      },
      "month": {
        "unitAmount": 19900,
        "envKey": "STRIPE_PRICE_ID_MX_MONTH",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKtCz0CerLuxwQHegdC33"
      },
      "year": {
        "unitAmount": 199000,
        "envKey": "STRIPE_PRICE_ID_MX_YEAR",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKvCz0CerLuxwMfX8KdmC"
      }
    }
  },
  "za": {
    "currency": "ZAR",
    "intervals": {
      "week": {
        "unitAmount": 6900,
        "envKey": "STRIPE_PRICE_ID_ZA_WEEK",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKyCz0CerLuxwOHUtjn4i"
      },
      "month": {
        "unitAmount": 19900,
        "envKey": "STRIPE_PRICE_ID_ZA_MONTH",
        "legacyEnvKey": null,
        "priceId": "price_1UHPKxCz0CerLuxw9cieICvO"
      }
    }
  },
  "us": {
    "currency": "USD",
    "intervals": {
      "month": {
        "unitAmount": 1999,
        "envKey": "STRIPE_PRICE_ID_US_MONTH",
        "legacyEnvKey": null,
        "priceId": "price_1UHPIGCz0CerLuxwjBlGekGk"
      }
    }
  }
};
