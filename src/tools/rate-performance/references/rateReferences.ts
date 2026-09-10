import type { RateReference } from "./types";

export const rateReferences: ReadonlyArray<Readonly<RateReference>> = Object.freeze([
  Object.freeze({
    id: "tian-2019-rate-performance",
    authors: Object.freeze([
      "Ruiyuan Tian",
      "Sang-Hoon Park",
      "Paul J. King",
      "Graeme Cunningham",
      "João Coelho",
      "Valeria Nicolosi",
      "Jonathan N. Coleman",
    ]),
    title: "Quantifying the factors limiting rate performance in battery electrodes",
    journal: "Nature Communications",
    year: 2019,
    volume: "10",
    articleNumber: "1933",
    doi: "10.1038/s41467-019-09792-9",
    url: "https://doi.org/10.1038/s41467-019-09792-9",
    role: "primary-model-source",
  }),
  Object.freeze({
    id: "tian-2020-chronoamperometry",
    authors: Object.freeze([
      "Ruiyuan Tian",
      "Paul J. King",
      "João Coelho",
      "Sang-Hoon Park",
      "Dominik V. Horvath",
      "Valeria Nicolosi",
      "Colm O'Dwyer",
      "Jonathan N. Coleman",
    ]),
    title: "Using chronoamperometry to rapidly measure and quantitatively analyse rate-performance in battery electrodes",
    journal: "Journal of Power Sources",
    year: 2020,
    volume: "468",
    articleNumber: "228220",
    doi: "10.1016/j.jpowsour.2020.228220",
    url: "https://doi.org/10.1016/j.jpowsour.2020.228220",
    role: "primary-model-source",
  }),
  Object.freeze({
    id: "coleman-tian-2020-model-review",
    authors: Object.freeze([
      "Jonathan N. Coleman",
      "Ruiyuan Tian",
    ]),
    title: "Developing models to fit capacity–rate data in battery systems",
    journal: "Current Opinion in Electrochemistry",
    year: 2020,
    volume: "21",
    pages: "1-6",
    doi: "10.1016/j.coelec.2019.12.003",
    url: "https://doi.org/10.1016/j.coelec.2019.12.003",
    role: "review",
  }),
  Object.freeze({
    id: "heubner-2018-master-curve",
    authors: Object.freeze([
      "C. Heubner",
      "J. Seeba",
      "T. Liebmann",
      "A. Nickol",
      "S. Börner",
      "M. Fritsch",
      "K. Nikolowski",
      "M. Wolter",
      "M. Schneider",
      "A. Michaelis",
    ]),
    title: "Semi-empirical master curve concept describing the rate capability of lithium insertion electrodes",
    journal: "Journal of Power Sources",
    year: 2018,
    volume: "380",
    pages: "83-91",
    doi: "10.1016/j.jpowsour.2018.01.077",
    url: "https://doi.org/10.1016/j.jpowsour.2018.01.077",
    role: "candidate-model-source",
  }),
  Object.freeze({
    id: "heubner-2018-chronoamperometry",
    authors: Object.freeze([
      "C. Heubner",
      "C. Lämmel",
      "A. Nickol",
      "T. Liebmann",
      "M. Schneider",
      "A. Michaelis",
    ]),
    title: "Comparison of chronoamperometric response and rate-performance of porous insertion electrodes: Towards an accelerated rate capability test",
    journal: "Journal of Power Sources",
    year: 2018,
    volume: "397",
    pages: "11-15",
    doi: "10.1016/j.jpowsour.2018.06.087",
    url: "https://doi.org/10.1016/j.jpowsour.2018.06.087",
    role: "chronoamperometry-context",
  }),
]);

const referenceById = new Map(rateReferences.map((reference) => [reference.id, reference]));

export function getRateReference(id: string): Readonly<RateReference> | undefined {
  return referenceById.get(id);
}

export function listRateReferences(): ReadonlyArray<Readonly<RateReference>> {
  return rateReferences;
}
