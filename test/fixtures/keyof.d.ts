export type SimpleChanges<T = any> = {
  [P in keyof T]?: T[P];
};
