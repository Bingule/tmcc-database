export type RateReferenceRole =
  | "primary-model-source"
  | "review"
  | "candidate-model-source"
  | "chronoamperometry-context";

export interface RateReference {
  readonly id: string;
  readonly authors: ReadonlyArray<string>;
  readonly title: string;
  readonly journal: string;
  readonly year: number;
  readonly volume: string;
  readonly pages?: string;
  readonly articleNumber?: string;
  readonly doi: string;
  readonly url: string;
  readonly role: RateReferenceRole;
}
