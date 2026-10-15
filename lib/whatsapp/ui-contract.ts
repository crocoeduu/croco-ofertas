export const whatsappTemplates=['auto','standard','simple','discount','complete'] as const;
export type WhatsAppTemplate=typeof whatsappTemplates[number];
export const qualityModes={conservative:{minimumScore:70,minimumIntervalMinutes:60,maximumPerHour:1,maximumPerDay:6},balanced:{minimumScore:60,minimumIntervalMinutes:30,maximumPerHour:2,maximumPerDay:12},aggressive:{minimumScore:50,minimumIntervalMinutes:15,maximumPerHour:4,maximumPerDay:20}} as const;
