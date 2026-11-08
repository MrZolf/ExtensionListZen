# Changelog

## 1.0.0
- Initial Sine package.
- Unified vertical layout for both extension groups.
- Extension names resolved through AddonManager.
- Dynamic DOM observation.
- Bounded panel body with vertical scrolling.

## 1.0.1
- Selektor `.unified-extensions-item` zamiast `toolbaritem.unified-extensions-item` (obsluga <unified-extensions-item>)
- Uzycie natywnej nazwy zamiast wlasnego labela; usuniety blad `" flex"`
- Przycisk akcji nie ma juz sztywnych 36px

## 1.1.0
- Jednolity wyglad kafelkow (usuniete przyciemnienie nazw i przerwa miedzy grupami)
- Przycisk "+" przeniesiony na gore + przycisk ustawien rozszerzen
- Panel szerszy o ~40%, margines po prawej dla scrolla
- Przypinanie na poczatek listy z menu 3 kropek

## 1.2.0
- Poszerzenie wszystkich kontenerow panelu (panelmultiview/viewcontainer/viewstack)
- Ukryty domyslny plus Zena; wlasne przyciski ikonowe (AMO + ustawienia)
- Teksty wg jezyka przegladarki (pl/en)

## 1.3.0
- Wymuszanie szerokosci okienka panelu (panel.sizeTo)
- Pasek wyszukiwania (dopasowane na gorze, reszta przyciemniona)
- Ukrywanie rozszerzen na koniec listy + "Pokaz wszystkie"
- Usuniety gradient na dole listy i animacja hover

## 1.3.1
- Przycisk "pokaz wszystkie" nie zamyka panelu (closemenu=none)
- Menu 3 kropek: Pin to Toolbar, Pin to top, Move Up, Move Down, Hide w jednym bloku
- Log diagnostyczny [extensions-list-sine] fit
