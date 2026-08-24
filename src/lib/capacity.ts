export const FARADAY_CONSTANT = 96485.33212;

export function calculateTheoreticalCapacity(molarMass: number, electrons: number): number {
  if (!Number.isFinite(molarMass) || molarMass <= 0) {
    throw new Error("invalidMolarMass");
  }
  if (!Number.isFinite(electrons) || electrons <= 0) {
    throw new Error("invalidElectrons");
  }

  const capacity = (electrons / molarMass) * (FARADAY_CONSTANT / 3.6);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("invalidCapacity");
  }
  return capacity;
}
