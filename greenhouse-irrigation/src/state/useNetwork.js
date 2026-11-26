import { useMemo, useReducer } from 'react'
import { buildNetwork, DEFAULT_PARAMS } from '../lib/network.js'

const initialState = {
  params: { ...DEFAULT_PARAMS, seed: 'GREENHOUSE-01' },
  overrides: {
    laterals: {}, // { [lateralId]: { x?, emitterSpacing? } }
    mainSegments: {} // { [segKey]: dnIndex }
  },
  selection: null, // { kind: 'lateral' | 'segment', id }
  nonce: 0
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PARAM': {
      const { key, value } = action
      return { ...state, params: { ...state.params, [key]: value } }
    }
    case 'SET_SEED':
      return { ...state, params: { ...state.params, seed: String(action.value) } }
    case 'REGENERATE':
      // 同种子同参数 -> 几何完全一致；nonce 仅用于触发一次重算演示
      return { ...state, nonce: state.nonce + 1 }
    case 'MOVE_LATERAL': {
      const prev = state.overrides.laterals[action.id] || {}
      return {
        ...state,
        overrides: {
          ...state.overrides,
          laterals: {
            ...state.overrides.laterals,
            [action.id]: { ...prev, x: action.x }
          }
        }
      }
    }
    case 'SET_LATERAL_SPACING': {
      const prev = state.overrides.laterals[action.id] || {}
      return {
        ...state,
        overrides: {
          ...state.overrides,
          laterals: {
            ...state.overrides.laterals,
            [action.id]: { ...prev, emitterSpacing: action.spacing }
          }
        }
      }
    }
    case 'RESET_LATERAL': {
      const rest = { ...state.overrides.laterals }
      delete rest[action.id]
      return { ...state, overrides: { ...state.overrides, laterals: rest } }
    }
    case 'SET_SEGMENT_DN':
      return {
        ...state,
        overrides: {
          ...state.overrides,
          mainSegments: { ...state.overrides.mainSegments, [action.segKey]: action.dnIndex }
        }
      }
    case 'CLEAR_SEGMENT_DN': {
      const rest = { ...state.overrides.mainSegments }
      delete rest[action.segKey]
      return { ...state, overrides: { ...state.overrides, mainSegments: rest } }
    }
    case 'RESET_ALL_MANUAL':
      return {
        ...state,
        overrides: { laterals: {}, mainSegments: {} },
        selection: null
      }
    case 'SELECT':
      return { ...state, selection: action.selection }
    default:
      return state
  }
}

export function useNetwork() {
  const [state, dispatch] = useReducer(reducer, initialState)
  // 任何参数/覆盖变化都会重算；种子不变时结果严格一致
  const network = useMemo(
    () => buildNetwork(state.params, state.overrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.params, state.overrides, state.nonce]
  )
  return { state, network, dispatch }
}
