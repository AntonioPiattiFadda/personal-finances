// Estado compartido de la app y forma de las pantallas.

export type View = (root: HTMLElement) => Promise<void>;

export const app = {
  email: '',
  /** Vuelve a pintar la pantalla actual con datos frescos (lo asigna main.ts). */
  refresh: async (): Promise<void> => {},
};
