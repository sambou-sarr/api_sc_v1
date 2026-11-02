import { prisma } from "../../database/prisma/prisma-client";
import type { UpdateAppSettingsInput } from "./app-settings.schemas";

const DEFAULTS = {
  id: 1,
  platformName: "Support Connecté",
  supportEmail: null,
  supportPhone: null,
  socialLinks: { instagram: "", facebook: "", linkedin: "" },
  maintenance: false,
};

const getOrCreate = () =>
  prisma.appSetting.upsert({
    where: { id: 1 },
    create: DEFAULTS,
    update: {},
  });

export const AppSettingsService = {
  async getAdmin() {
    const settings = await getOrCreate();
    return {
      ...settings,
      supportEmail: settings.supportEmail ?? "",
      supportPhone: settings.supportPhone ?? "",
      socialLinks: {
        instagram: "",
        facebook: "",
        linkedin: "",
        ...(settings.socialLinks as Record<string, string>),
      },
    };
  },

  async update(input: UpdateAppSettingsInput) {
    await prisma.appSetting.upsert({
      where: { id: 1 },
      create: {
        ...DEFAULTS,
        ...input,
        supportEmail: input.supportEmail || null,
        supportPhone: input.supportPhone || null,
      },
      update: {
        ...input,
        supportEmail: input.supportEmail || null,
        supportPhone: input.supportPhone || null,
      },
    });
    return this.getAdmin();
  },

  async getPublic() {
    const settings = await getOrCreate();
    return {
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      socialLinks: settings.socialLinks,
      maintenance: settings.maintenance,
    };
  },
};
