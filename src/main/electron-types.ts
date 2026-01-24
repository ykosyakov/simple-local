// Module augmentation to extend Electron's App interface
declare global {
  namespace Electron {
      interface App {
          isQuitting?: boolean;
      }
  }
}
export {}
