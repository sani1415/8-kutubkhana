/** Phosphor icons — one family for the whole app. */
import { raw } from './dom.js';

const WEIGHT = { regular: 'ph', fill: 'ph-fill', duotone: 'ph-duotone' };

export function icon(name, weight = 'regular') {
    return raw(`<i class="${WEIGHT[weight] || 'ph'} ph-${name}" aria-hidden="true"></i>`);
}
