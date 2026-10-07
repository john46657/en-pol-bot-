"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonListStore = void 0;
/** Liste von Einstellungs-Dokumenten in einer SystemSetting-Zeile (Panels, Staff-Listen, Vorlagen …). Ungültige Einträge werden beim Lesen verworfen. */
class JsonListStore {
    prisma;
    key;
    schema;
    max;
    constructor(prisma, key, schema, max = 100) {
        this.prisma = prisma;
        this.key = key;
        this.schema = schema;
        this.max = max;
    }
    async all() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: this.key } }))?.value;
        return (Array.isArray(v) ? v : []).flatMap((x) => { const p = this.schema.safeParse(x); return p.success ? [p.data] : []; });
    }
    async get(id) { return (await this.all()).find((x) => x.id === id); }
    async write(list, tx = this.prisma) {
        const value = list.slice(0, this.max);
        await tx.systemSetting.upsert({ where: { key: this.key }, create: { key: this.key, value }, update: { value } });
    }
    /** Einfügen oder ersetzen; liefert [neu, alt]. */
    async upsert(doc, tx) {
        const list = await this.all();
        const old = list.find((x) => x.id === doc.id);
        await this.write(old ? list.map((x) => (x.id === doc.id ? doc : x)) : [...list, doc], tx);
        return [doc, old];
    }
    async remove(id, tx) {
        const list = await this.all();
        const old = list.find((x) => x.id === id);
        if (old)
            await this.write(list.filter((x) => x.id !== id), tx);
        return old;
    }
}
exports.JsonListStore = JsonListStore;
//# sourceMappingURL=json-store.js.map