import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { UseInterceptors, Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { StoreService } from './store.service';

const xmlEntities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, character => xmlEntities[character] || character);
const safeColour = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : '#315bea';
const productArtwork = (title: string, subtitle: string, colour: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${escapeXml(title)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${safeColour(colour)}" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12203b" flood-opacity=".16"/></filter></defs><rect width="800" height="600" fill="#f6f8fb"/><circle cx="400" cy="280" r="235" fill="url(#g)"/><g filter="url(#s)"><path d="M270 190h260l45 85-56 220H281l-56-220z" fill="#fff" stroke="${safeColour(colour)}" stroke-width="12"/><path d="M225 275h350M305 190l24-62h142l24 62" fill="none" stroke="${safeColour(colour)}" stroke-width="12" stroke-linejoin="round"/><circle cx="400" cy="340" r="76" fill="${safeColour(colour)}" opacity=".9"/><path d="M365 340h70M400 305v70" stroke="#fff" stroke-width="15" stroke-linecap="round"/></g><text x="400" y="548" text-anchor="middle" fill="#67758c" font-family="Arial,sans-serif" font-size="21" font-weight="700">${escapeXml(subtitle)}</text></svg>`;

const bannerArtwork = (title: string, category: string, colour: string) => {
  const accent = safeColour(colour);
  const motif = category === 'plumbing' || category === 'pipes'
    ? '<path d="M248 145v105h175v118h130v-74"/><path d="M210 145h76M385 214h76M515 294h76"/><circle cx="553" cy="407" r="28"/>'
    : category === 'paints'
      ? '<path d="M225 184h205v248H225zM245 148h165v36M430 250l105-63 54 88-105 63z"/><path d="M535 187l36-22 35 58"/>'
      : category === 'fans'
        ? '<circle cx="400" cy="290" r="55"/><path d="M400 235c-9-94 62-132 118-101 22 65-26 113-75 135M447 313c85 40 82 120 29 154-66-16-75-83-54-132M360 321c-76 54-145 14-149-50 45-51 109-26 148 11"/>'
        : category === 'hardware' || category === 'construction'
          ? '<path d="M234 405 471 168l58 58-237 237zM440 199l79-79 79 79-79 79M209 436l-42 66 66-42"/><path d="M498 342h115v103H498z"/>'
          : '<path d="M245 375h130V185h82v190h112M286 185v-62M416 185v-62M530 375v105M485 480h90"/><circle cx="286" cy="106" r="30"/><circle cx="416" cy="106" r="30"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${escapeXml(title)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="#203253"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#13203c" flood-opacity=".2"/></filter></defs><circle cx="405" cy="300" r="245" fill="${accent}" opacity=".08"/><circle cx="405" cy="300" r="185" fill="#fff" opacity=".75"/><g fill="none" stroke="url(#g)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" filter="url(#s)">${motif}</g><g fill="${accent}" opacity=".55"><circle cx="162" cy="180" r="12"/><circle cx="650" cy="135" r="9"/><circle cx="675" cy="445" r="15"/></g></svg>`;
};

const logoArtwork = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="V K S VEL TRADERS"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2b544"/><stop offset="1" stop-color="#d86727"/></linearGradient></defs><rect x="4" y="4" width="152" height="152" rx="36" fill="#fff" stroke="#e3c37f" stroke-width="5"/><circle cx="80" cy="69" r="49" fill="#fff8e7" stroke="url(#g)" stroke-width="5"/><path d="M48 86c12-23 22-35 32-35s20 12 32 35" fill="none" stroke="#9f4c26" stroke-width="8" stroke-linecap="round"/><path d="M80 28c9 13 14 24 14 34a14 14 0 0 1-28 0c0-10 5-21 14-34z" fill="url(#g)"/><text x="80" y="106" text-anchor="middle" fill="#7d3e24" font-family="Georgia,serif" font-size="24" font-weight="700">VKS</text><path d="M25 124h110" stroke="#dfb869" stroke-width="3"/><text x="80" y="144" text-anchor="middle" fill="#243354" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2">VEL TRADERS</text></svg>`;

@UseInterceptors(StoreTransactionInterceptor)
@Controller('media')
export class MediaController {
  constructor(private readonly store: StoreService) {}
  @Get('logo.svg') @Header('Content-Type', 'image/svg+xml') logo() { return logoArtwork(); }
  @Get('products/:id.svg') @Header('Content-Type', 'image/svg+xml') product(@Param('id') id: string) { const item = this.store.products.find(product => product.id === id); if (!item) throw new NotFoundException(); return productArtwork(item.name, `HSN ${item.hsn}`, item.accent); }
  @Get('banners/:id.svg') @Header('Content-Type', 'image/svg+xml') banner(@Param('id') id: string) { const item = this.store.banners.find(banner => banner.id === id); if (!item) throw new NotFoundException(); return bannerArtwork(item.title, item.categoryId, item.accent); }
}
