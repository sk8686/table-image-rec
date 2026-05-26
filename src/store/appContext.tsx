import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { ImageUploaderOutput, PreprocessorOutput, TableData, ProgressEvent } from '@/types';

// State
interface AppState {
  step: 'upload' | 'preprocess' | 'recognize' | 'edit';
  imageOutput: ImageUploaderOutput | null;
  preprocessOutput: PreprocessorOutput | null;
  tableData: TableData | null;
  progress: ProgressEvent | null;
  error: string | null;
}

const initialState: AppState = {
  step: 'upload',
  imageOutput: null,
  preprocessOutput: null,
  tableData: null,
  progress: null,
  error: null,
};

// Actions
type AppAction =
  | { type: 'SET_IMAGE'; payload: ImageUploaderOutput }
  | { type: 'SET_PREPROCESS_OUTPUT'; payload: PreprocessorOutput }
  | { type: 'SET_TABLE_DATA'; payload: TableData }
  | { type: 'SET_PROGRESS'; payload: ProgressEvent | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_STEP'; payload: AppState['step'] }
  | { type: 'RESET' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        imageOutput: action.payload,
        step: 'preprocess',
        error: null,
      };
    case 'SET_PREPROCESS_OUTPUT':
      return {
        ...state,
        preprocessOutput: action.payload,
        step: 'recognize',
      };
    case 'SET_TABLE_DATA':
      return {
        ...state,
        tableData: action.payload,
        step: 'edit',
        progress: { stage: 'completed', progress: 1, message: '识别完成' },
      };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// Context
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within AppProvider');
  }
  return context;
}
