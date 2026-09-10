export interface RateDisplayEquation {
  readonly source: string;
  readonly tex: string;
}

export const RATE_DISPLAY_EQUATIONS = Object.freeze({
  transitionRate: Object.freeze({
    source: "R_T = (1/2)^(1/n) / tau",
    tex: String.raw`R_{\mathrm T}=\frac{(1/2)^{1/n}}{\tau}`,
  }),
  ca: Object.freeze({
    source: "Q(t) = (1/m) integral_0^t I_adj(t') dt'; R(t) = [I_adj(t)/m] / Q(t); Q(R) = Q_M / [1 + 2(R tau)^n]",
    tex: String.raw`Q(t)=\frac{1}{m}\int_0^t I_{\mathrm{adj}}(t')\,\mathrm{d}t'\qquad R(t)=\frac{I_{\mathrm{adj}}(t)/m}{Q(t)}\qquad Q(R)=\frac{Q_{\mathrm{M}}}{1+2(R\tau)^n}`,
  }),
  energy: Object.freeze({
    source: "E = integral V dQ; P_avg = E / delta_t",
    tex: String.raw`E=\int V\,\mathrm{d}Q\qquad P_{\mathrm{avg}}=\frac{E}{\Delta t}`,
  }),
  transport: Object.freeze({
    source: "Eq. 5a-6b transport-timescale decomposition",
    tex: String.raw`\begin{aligned}
      \text{Eq. 5a:}\quad &\tau=\tau_{\mathrm{Electrical}}+\tau_{\mathrm{Diffusive}}+t_{\mathrm c}\\
      \text{Eq. 5b:}\quad &\tau_{\mathrm{Diffusive}}=\frac{L_{\mathrm E}^2}{D_{\mathrm P}}+\frac{L_{\mathrm S}^2}{D_{\mathrm S}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}\\
      \text{Eq. 5c:}\quad &\tau_{\mathrm{Electrical}}=C_{\mathrm{eff}}\left(R_{\mathrm{E,E}}+R_{\mathrm{I,P}}+R_{\mathrm{I,S}}\right)\\
      \text{Eq. 5d:}\quad &\tau=C_{\mathrm{eff}}\left(R_{\mathrm{E,E}}+R_{\mathrm{I,P}}+R_{\mathrm{I,S}}\right)+\frac{L_{\mathrm E}^2}{D_{\mathrm P}}+\frac{L_{\mathrm S}^2}{D_{\mathrm S}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}+t_{\mathrm c}\\
      \text{Tian Eq. 6a:}\quad &\tau=L_{\mathrm E}^2\left[\frac{C_{\mathrm{V,eff}}}{2\sigma_{\mathrm E}}+\frac{C_{\mathrm{V,eff}}}{2\sigma_{\mathrm{BL}}P_{\mathrm E}^{3/2}}+\frac{1}{D_{\mathrm{BL}}P_{\mathrm E}^{3/2}}\right]\\
      &\quad+L_{\mathrm E}\left[\frac{L_{\mathrm S}C_{\mathrm{V,eff}}}{\sigma_{\mathrm{BL}}P_{\mathrm S}^{3/2}}\right]+\left[\frac{L_{\mathrm S}^2}{D_{\mathrm{BL}}P_{\mathrm S}^{3/2}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}+t_{\mathrm c}\right]\\
      \text{Eq. 6b:}\quad &\tau=aL_{\mathrm E}^2+bL_{\mathrm E}+c
    \end{aligned}`,
  }),
  thickness: Object.freeze({
    linear: Object.freeze({ source: "tau = b0 + b1 L", tex: String.raw`\tau=b_0+b_1L` }),
    quadratic: Object.freeze({ source: "tau = b0 + b2 L^2", tex: String.raw`\tau=b_0+b_2L^2` }),
    power: Object.freeze({ source: "tau = a L^alpha", tex: String.raw`\tau=aL^\alpha` }),
  }),
});
