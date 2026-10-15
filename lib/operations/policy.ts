import { AppError } from '../errors';
export const safeDefaults = {
 watchlistEnabled:true, autoApprovalEnabled:false, distributionEnabled:false, whatsappEnabled:false,
 paused:true, dryRun:true, minimumScore:60, watchIntervalHours:24, maximumPerHour:2, maximumPerDay:8,
 minimumIntervalMinutes:60, windowStart:8, windowEnd:22, collectionBudget:3,
};
export type Settings = typeof safeDefaults;
export function validateSettings(value:Record<string,unknown>):Settings {
 if(Object.keys(value).some(key=>!Object.hasOwn(safeDefaults,key)))throw new AppError('REQUEST_INVALID');
 const next={...safeDefaults,...value} as Settings;
 for(const key of ['watchlistEnabled','autoApprovalEnabled','distributionEnabled','whatsappEnabled','paused','dryRun'] as const)if(typeof next[key]!=='boolean')throw new AppError('REQUEST_INVALID');
 const ranges={minimumScore:[1,100],watchIntervalHours:[1,168],maximumPerHour:[1,10],maximumPerDay:[1,50],minimumIntervalMinutes:[15,1440],windowStart:[0,23],windowEnd:[1,24],collectionBudget:[1,5]};
 for(const [key,[low,high]] of Object.entries(ranges)){const n=next[key as keyof Settings];if(typeof n!=='number'||!Number.isInteger(n)||n<low||n>high)throw new AppError('REQUEST_INVALID');}
 if(next.windowStart>=next.windowEnd||!next.dryRun||next.whatsappEnabled||next.autoApprovalEnabled)throw new AppError('REQUEST_INVALID'); // Experimental transports and automatic approval have no official adapter yet.
 return next;
}
export function effectiveSettings(config:Record<string,unknown>):Settings {
 const settings=validateSettings(config);
 if(process.env.WATCHLIST_ENABLED==='false')settings.watchlistEnabled=false;
 if(process.env.DISTRIBUTION_ENABLED==='false')settings.distributionEnabled=false;
 // No environment value can turn on a not-yet-configured external sender.
 return {...settings,dryRun:true,whatsappEnabled:false,autoApprovalEnabled:false};
}
export function withinWindow(settings:Settings,now=new Date()):boolean {
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'numeric',hourCycle:'h23'}).format(now));
 return hour>=settings.windowStart&&hour<settings.windowEnd;
}
export function retryDelay(failures:number):number {return Math.min(24*3600000,15*60000*2**Math.max(0,failures-1));}
