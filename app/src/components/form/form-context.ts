import { createContext, useContext } from 'react'

const FormIdContext = createContext<string | undefined>(undefined)
export const useFormId = () => useContext(FormIdContext)
export { FormIdContext }