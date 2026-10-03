// Types du module partagé avec le site (lib/simulation-15min.js, calcul exact).
declare module "*/lib/simulation-15min.js" {
  const SIM15: {
    simuler(o: {lambdaH: number; lambdaA: number; favori: "home" | "away" | null; ligueApi?: number; etat?: {minute: number; butsDom?: number; butsExt?: number; rougeDom?: number; rougeExt?: number}}): any;
    champPipeline(o: {lambdaH: number; lambdaA: number; favori: "home" | "away" | null; ligueApi?: number}): any;
    TRANCHES: string[];
  };
  export default SIM15;
}
