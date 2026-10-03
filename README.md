# Newton's Law of Cooling

An interactive single-page app that visualizes **Newton's Law of Cooling** — how an object's temperature changes over time toward its surroundings.

$$\frac{dT}{dt} = -k\,(T - T_a(t))$$

Built with **Vite + React + TypeScript**, plotted with **Plotly**, and rendered with **KaTeX**.

## Features

- Compute the cooling constant **k** analytically (constant ambient) or via bisection fitting (time-varying ambient)
- Visualize T(t) and Tₐ(t) interactively
- Supports constant, sinusoidal, and linear ambient temperature profiles
- Numerically integrates the ODE using a 4th-order Runge-Kutta (RK4) method

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Running Tests

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

## Building for Production

```bash
npm run build
```

The output is written to the `dist/` directory.

## Deploying to Netlify

This repo includes a `netlify.toml` that sets the build command and publish directory.

1. Push the repo to GitHub/GitLab.
2. Connect the repository in the [Netlify dashboard](https://app.netlify.com/).
3. Netlify will automatically run `npm run build` and deploy the `dist/` folder.

No further configuration is required.

