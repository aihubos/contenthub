export type Format = 'shorts' | 'youtube' | 'blog';
export type Source = { title: string; url: string; publisher: string; kind: string; publishedAt: string | null; checkedAt: string; note: string };
export type Idea = { image?: {src: string; alt: string; caption: string}; id: string; format: Format; category: string; title: string; summary: string; whyNow: string; fit: string; signal: '시의성' | '채널 적합' | '후속 기획'; duration: string; hook: string; outline: string[]; keywords: string[]; sources: Source[]; duplicate: {type: 'new' | 'followup'; related: string[]; note: string}; guardrail: string; accent: string };
export type Brief = { date: string; generatedAt: string; coverage: {title: string; status: string; note: string; url: string}[]; ideas: Idea[]; topIds: string[] };
export type BriefEdition = { id: string; generatedAt: string; count: number };
export type BriefIndex = { date: string; count: number; legacyEdition?: string; currentEdition?: string; editions?: BriefEdition[] };
export type Index = { latest: string; lastSuccessAt: string; schedule: string; briefs: BriefIndex[] };
export type Saved = Record<string, { favorite: boolean; status: string; title: string; date: string; format: Format; edition?: string; ideaId?: string }>;
