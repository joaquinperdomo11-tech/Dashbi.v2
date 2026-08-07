import { db } from "@/lib/db";
import { adsAdvertisers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Resuelve advertiser_id + site_id de Product Ads para un tenant. Cachea el
 * resultado en ads_advertisers para no llamar a ML en cada sync — se
 * refresca solo si no hay registro o el registro dice que no está habilitado
 * (por si el usuario lo activó después de la primera revisión).
 */
export async function resolverAdvertiser(
  tenantId: string,
  accessToken: string
): Promise<{ advertiserId: string; siteId: string } | null> {
  const [cached] = await db
    .select()
    .from(adsAdvertisers)
    .where(eq(adsAdvertisers.tenantId, tenantId));

  if (cached && cached.productAdsEnabled) {
    return { advertiserId: cached.advertiserId, siteId: cached.siteId };
  }

  const res = await fetch("https://api.mercadolibre.com/advertising/advertisers?product_id=PADS", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Api-Version": "1",
    },
  });

  if (res.status === 404) {
    if (cached) {
      await db
        .update(adsAdvertisers)
        .set({ productAdsEnabled: false, lastCheckedAt: new Date() })
        .where(eq(adsAdvertisers.tenantId, tenantId));
    } else {
      await db.insert(adsAdvertisers).values({
        tenantId,
        advertiserId: "0",
        siteId: "",
        productAdsEnabled: false,
      });
    }
    return null;
  }

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const advertiser = data?.advertisers?.[0];
  if (!advertiser?.advertiser_id || !advertiser?.site_id) return null;

  const advertiserId = String(advertiser.advertiser_id);
  const siteId = String(advertiser.site_id);

  if (cached) {
    await db
      .update(adsAdvertisers)
      .set({
        advertiserId,
        siteId,
        advertiserName: advertiser.advertiser_name ?? null,
        productAdsEnabled: true,
        lastCheckedAt: new Date(),
      })
      .where(eq(adsAdvertisers.tenantId, tenantId));
  } else {
    await db.insert(adsAdvertisers).values({
      tenantId,
      advertiserId,
      siteId,
      advertiserName: advertiser.advertiser_name ?? null,
      productAdsEnabled: true,
    });
  }

  return { advertiserId, siteId };
}
