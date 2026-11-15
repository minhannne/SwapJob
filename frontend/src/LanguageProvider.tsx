import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LanguageContext, translations, useLanguage } from './i18n'
import type { Language } from './i18n'

const storageKey = 'swapjob-language'

function readSavedLanguage(): Language {
  if (typeof window === 'undefined') return 'vi'

  try {
    return window.localStorage.getItem(storageKey) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readSavedLanguage)

  useEffect(() => {
    document.documentElement.lang = language

    try {
      window.localStorage.setItem(storageKey, language)
    } catch {
      // Lựa chọn vẫn áp dụng trong phiên hiện tại khi trình duyệt chặn lưu trữ.
    }
  }, [language])

  return (
    <LanguageContext.Provider
      value={{
        language,
        locale: language === 'vi' ? 'vi-VN' : 'en-GB',
        setLanguage,
        t: key => translations[language][key],
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="sj-language-switch" role="group" aria-label="Language / Ngôn ngữ">
      <button
        type="button"
        lang="vi"
        aria-label="Tiếng Việt"
        aria-pressed={language === 'vi'}
        onClick={() => setLanguage('vi')}
      >
        VI
      </button>
      <button
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  )
}