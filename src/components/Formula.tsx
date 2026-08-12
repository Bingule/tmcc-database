import { formatFormulaParts } from "../lib/materials";

export function Formula({ formula }: { formula: string }) {
  return (
    <span className="formula" aria-label={formula}>
      {formatFormulaParts(formula).map((part, index) =>
        part.subscript ? <sub key={`${part.text}-${index}`}>{part.text}</sub> : <span key={`${part.text}-${index}`}>{part.text}</span>
      )}
    </span>
  );
}
