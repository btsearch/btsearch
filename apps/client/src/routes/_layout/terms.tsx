import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { APP_NAME } from "@/lib/api";

const markdownClasses =
  "space-y-4 text-sm text-muted-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:pt-4 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:space-y-2 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a:hover]:opacity-80 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_strong]:text-foreground";

const REMARK_PLUGINS = [remarkGfm];

const content = `**REGULAMIN SERWISU BTSearch**

_Serwis BTSearch jest projektem o charakterze technicznym i społecznościowym, którego celem jest gromadzenie, prezentowanie oraz rozwijanie bazy danych o stacjach bazowych telefonii komórkowej w Polsce._

_Serwis działa jako narzędzie informacyjne oraz platforma współpracy użytkowników, którzy w sposób rozproszony uczestniczą w uzupełnianiu i aktualizacji danych. Dane prezentowane w Serwisie mogą pochodzić zarówno z publicznie dostępnych źródeł, jak i od społeczności użytkowników._

_Niniejszy Regulamin określa zasady korzystania z Serwisu, w tym prawa i obowiązki Użytkowników oraz Administratora._

**§ 1. POSTANOWIENIA OGÓLNE**

1. Niniejszy Regulamin określa zasady świadczenia usług drogą elektroniczną przez Krzysztofa Niemczyka zgodnie z ustawą z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.
2. Administratorem Serwisu jest:

Krzysztof Niemczyk, e-mail: [k.niemczyk@btsearch.pl](mailto:k.niemczyk@btsearch.pl)
dalej: „Administrator".

3. Serwis działa pod adresem btsearch.pl oraz może być czasowo dostępny także pod adresami testowymi, roboczymi lub technicznymi powiązanymi z Serwisem.
4. Serwis stanowi front-end do bazy danych o stacjach bazowych telefonii komórkowej w Polsce.
5. Dane w bazie są uzupełniane i rozwijane przez rozproszoną społeczność Użytkowników z całej Polski.
6. W bazie znajdują się również dane pochodzące z publicznie dostępnych źródeł, w szczególności publiczne dane Urzędu Komunikacji Elektronicznej dotyczące pozwoleń radiowych.
7. Serwis ma charakter informacyjny, techniczny i społecznościowy.
8. Dane prezentowane w Serwisie mają charakter informacyjny i mogą pochodzić zarówno od Użytkowników, jak i z publicznych źródeł.
9. Serwis nie jest oficjalnym serwisem operatorów telekomunikacyjnych ani organów administracji publicznej.
10. Korzystanie z Serwisu oznacza akceptację Regulaminu.

**§ 2. DEFINICJE**

1. Serwis / BTSearch - aplikacja internetowa dostępna online pod adresem btsearch.pl oraz adresami powiązanymi.
2. Użytkownik - osoba fizyczna korzystająca z Serwisu.
3. Konto - indywidualny dostęp Użytkownika do funkcjonalności wymagających rejestracji i logowania.
4. Moderator - Użytkownik posiadający uprawnienia do przeglądania, weryfikacji i zatwierdzania zgłoszeń dotyczących danych w Serwisie.
5. Administrator Serwisu - Administrator lub osoba działająca z jego upoważnienia, posiadająca rozszerzone uprawnienia techniczne lub administracyjne do Serwisu.
6. Treści Użytkownika - wszelkie dane, informacje, opisy, zgłoszenia, zdjęcia i inne materiały dodawane przez Użytkownika do Serwisu.
7. API - interfejs programistyczny udostępniany przez Administratora, umożliwiający zewnętrznym aplikacjom pobieranie wybranych danych z bazy Serwisu.
8. Dane publiczne - dane pochodzące z publicznie dostępnych źródeł, w tym w szczególności z publicznych źródeł dotyczących infrastruktury telekomunikacyjnej i pozwoleń radiowych.
9. Umowa - umowa o świadczenie usług drogą elektroniczną zawarta pomiędzy Użytkownikiem a Administratorem z chwilą rozpoczęcia korzystania z Serwisu, a w zakresie funkcjonalności wymagających Konta - z chwilą rejestracji i akceptacji Regulaminu.

**§ 3. ZAWARCIE I CZAS TRWANIA UMOWY**

1. Umowa zostaje zawarta z chwilą:
    - rozpoczęcia korzystania z Serwisu, albo
    - rejestracji Konta oraz akceptacji Regulaminu - w przypadku funkcji wymagających logowania.
2. Umowa zawierana jest na czas nieokreślony.
3. Korzystanie z ogólnodostępnych funkcji Serwisu jest nieodpłatne.
4. Użytkownik może zakończyć korzystanie z Serwisu w dowolnym momencie.
5. Użytkownik może usunąć Konto:
    - samodzielnie za pomocą funkcjonalności dostępnych w Serwisie, jeżeli są udostępnione albo
    - poprzez kontakt z Administratorem drogą elektroniczną.
6. Usunięcie Konta skutkuje rozwiązaniem Umowy w zakresie funkcjonalności wymagających posiadania Konta.

**§ 4. REJESTRACJA, WYMAGANIA TECHNICZNE I BEZPIECZEŃSTWO**

1. Rejestracja Konta wymaga podania danych wymaganych przez formularz rejestracyjny, w szczególności adresu e-mail oraz hasła, a także akceptacji Regulaminu i Polityki Prywatności.
2. Użytkownik zobowiązany jest do podawania danych zgodnych ze stanem rzeczywistym.
3. Dodawanie danych do bazy przez Użytkownika jest możliwe wyłącznie po zarejestrowaniu Konta w Serwisie.
4. Do prawidłowego korzystania z Serwisu niezbędne jest:
    - urządzenie z dostępem do Internetu,
    - aktualna przeglądarka internetowa,
    - włączona obsługa JavaScript oraz plików cookies,
    - aktywny adres e-mail - w przypadku rejestracji Konta.
    - Niektóre funkcjonalności Serwisu mogą korzystać z localStorage lub podobnych technologii po stronie przeglądarki.
5. Administrator może stosować środki techniczne i organizacyjne służące ochronie Serwisu i Kont Użytkowników, w szczególności:
    - szyfrowanie połączeń,
    - mechanizmy uwierzytelniania,
    - limity prób logowania,
    - blokady czasowe lub inne zabezpieczenia przed nadużyciami.
6. Użytkownik odpowiada za bezpieczeństwo danych logowania do swojego Konta i powinien chronić je przed dostępem osób trzecich.
7. Zabronione jest:
    - udostępnianie Konta osobom trzecim,
    - tworzenie wielu Kont w celu obchodzenia ograniczeń technicznych lub organizacyjnych,
    - wykorzystywanie Kont do działań automatycznych, masowych lub sprzecznych z przeznaczeniem Serwisu.
8. Administrator może zablokować lub ograniczyć Konto w przypadku naruszenia Regulaminu, bezpieczeństwa Serwisu lub uzasadnionego podejrzenia nadużycia.

**§ 5. FUNKCJONALNOŚCI SERWISU**

1. Serwis umożliwia w szczególności:
    - przeglądanie danych o stacjach bazowych telefonii komórkowej,
    - prezentowanie danych w formie map, zestawień i wyników wyszukiwania,
    - filtrowanie, przeszukiwanie i analizę danych,
    - dodawanie, edytowanie i zgłaszanie danych przez zarejestrowanych Użytkowników,
    - społeczną weryfikację zgłoszeń i zmian,
    - korzystanie z wybranych funkcji API,
    - utrzymywanie Kont Użytkowników.
2. Zakres dostępnych funkcjonalności może różnić się w zależności od statusu Użytkownika lub jego uprawnień w Serwisie.
3. Zgłoszenia i zmiany dodawane przez Użytkowników mogą być przeglądane i zatwierdzane przez Moderatorów.
4. Moderatorzy mają dostęp wyłącznie do funkcji związanych z weryfikacją danych i co do zasady nie mają dostępu do zarządzania Kontami ani do danych osobowych innych Użytkowników.
5. Dostęp do danych osobowych w Serwisie mają wyłącznie Administratorzy Serwisu, w zakresie niezbędnym do utrzymania, rozwoju, bezpieczeństwa i prawidłowego funkcjonowania Serwisu.
6. Administrator zastrzega sobie prawo do rozwijania, modyfikowania, ograniczania lub wyłączania poszczególnych funkcjonalności Serwisu.
7. Kod źródłowy Serwisu może być udostępniany publicznie jako open source. Udostępnienie kodu źródłowego nie oznacza udostępnienia danych znajdujących się w bazie Serwisu.

**§ 6. TREŚCI UŻYTKOWNIKÓW**

1. Użytkownik ponosi odpowiedzialność za Treści Użytkownika dodawane do Serwisu.
2. Dodając Treści Użytkownika do Serwisu, Użytkownik oświadcza, że posiada prawo do ich dodania, publikacji i wykorzystania w zakresie niezbędnym do funkcjonowania Serwisu.
3. Dodając Treści Użytkownika do Serwisu, Użytkownik udziela Administratorowi niewyłącznej, nieodpłatnej, nieograniczonej terytorialnie licencji na ich utrwalanie, zwielokrotnianie, publiczne udostępnianie, wyświetlanie oraz wykorzystywanie w ramach działania, rozwoju i promocji Serwisu.
4. Jeżeli Użytkownik dodaje zdjęcie, opis lub inny materiał pochodzący od osoby trzeciej, zobowiązany jest posiadać prawo do jego legalnego wykorzystania oraz - jeśli jest to wymagane - wskazać autora, źródło lub warunki licencyjne.
5. Administrator może usuwać, odrzucać, ukrywać lub ograniczać widoczność Treści Użytkownika naruszających Regulamin, przepisy prawa, prawa osób trzecich albo zasady funkcjonowania Serwisu.

**§ 7. API**

1. Serwis udostępnia publiczne API umożliwiające zewnętrznym aplikacjom pobieranie wybranych danych z bazy Serwisu.
2. API nie udostępnia danych osobowych zarejestrowanych Użytkowników.
3. Korzystanie z API może podlegać limitom technicznym, organizacyjnym lub bezpieczeństwa.
4. Każdy Użytkownik może posiadać maksymalnie jeden aktywny klucz API, o ile Administrator nie postanowi inaczej.
5. Nowy klucz API może być generowany nie częściej niż raz na 7 dni, o ile Serwis nie przewiduje innych zasad.
6. Klucz API nie może być ujawniany publicznie, w szczególności w publicznie dostępnych repozytoriach, kodzie frontendowym lub innych miejscach dostępnych dla nieoznaczonego kręgu odbiorców.
7. Administrator może ograniczyć, zawiesić lub zakończyć dostęp do API w przypadku nadużyć, ryzyka bezpieczeństwa, nadmiernego obciążenia Serwisu albo zmian technicznych.

**§ 8. ZAKAZANE DZIAŁANIA**

1. Zabronione jest korzystanie z Serwisu w sposób sprzeczny z prawem, Regulaminem lub dobrymi obyczajami.
2. W szczególności zabronione jest:
    - podejmowanie prób nieautoryzowanego dostępu do Serwisu, Kont innych Użytkowników, serwera lub bazy danych,
    - obchodzenie zabezpieczeń technicznych lub ograniczeń dostępu,
    - zakłócanie działania Serwisu, w tym jego przeciążanie,
    - publikowanie treści bezprawnych, nieprawdziwych lub naruszających prawa osób trzecich,
    - scraping, masowe pobieranie danych lub zautomatyzowane pozyskiwanie danych poza dozwolonym zakresem API,
    - wykorzystywanie Serwisu lub API w sposób mogący naruszyć bezpieczeństwo, integralność albo stabilność działania Serwisu.
3. Administrator może podejmować działania techniczne i organizacyjne mające na celu przeciwdziałanie naruszeniom, w tym blokować Konto, ograniczać dostęp do API lub usuwać określone treści.

**§ 9. DANE OSOBOWE I DOSTĘP DO INFRASTRUKTURY**

1. Administratorem danych osobowych Użytkowników jest Administrator.
2. Dane osobowe przetwarzane są w szczególności w celu:
    - utworzenia i obsługi Konta,
    - zapewnienia prawidłowego działania Serwisu,
    - obsługi zgłoszeń, reklamacji i bezpieczeństwa,
    - realizacji obowiązków wynikających z przepisów prawa.
3. Dostęp administracyjny do danych osobowych, serwera oraz bazy danych posiada wyłącznie ograniczona liczba osób upoważnionych przez Administratora.
4. Dostęp, o którym mowa powyżej, jest ograniczony do zakresu niezbędnego do utrzymania, rozwoju, bezpieczeństwa i prawidłowego funkcjonowania Serwisu.
5. Szczegółowe zasady przetwarzania danych osobowych, wykorzystywania plików cookies i innych technologii określa Polityka Prywatności.

**§ 10. REKLAMY, COOKIES I USŁUGI ZEWNĘTRZNE**

1. W Serwisie mogą być wyświetlane reklamy podmiotów trzecich, w szczególności reklamy Google.
2. Przychody z reklam mogą być przeznaczane na pokrywanie kosztów utrzymania i rozwoju Serwisu.
3. Serwis wykorzystuje pliki cookies oraz podobne technologie, w szczególności w celu:
    - utrzymania sesji logowania,
    - zapamiętywania wybranych ustawień interfejsu,
    - obsługi reklam, pomiaru skuteczności reklam i analityki.
4. Serwis może również wykorzystywać localStorage lub podobne technologie do przechowywania ustawień i preferencji Użytkownika po stronie przeglądarki.
5. Szczegółowe informacje dotyczące stosowanych plików cookies i technologii podobnych znajdują się w Polityce Prywatności.

**§ 11. ODPOWIEDZIALNOŚĆ**

1. Administrator dokłada należytej staranności, aby zapewnić prawidłowe funkcjonowanie Serwisu.
2. Administrator nie gwarantuje:
    - nieprzerwanego działania Serwisu,
    - pełnej dostępności wszystkich funkcji,
    - całkowitego braku błędów,
    - kompletności, poprawności lub aktualności wszystkich danych prezentowanych w Serwisie.
3. Dane dostępne w Serwisie mają charakter informacyjny, techniczny i pomocniczy.
4. Administrator nie odpowiada za:
    - decyzje podjęte na podstawie danych dostępnych w Serwisie,
    - skutki wykorzystania niepełnych, nieaktualnych albo błędnych danych,
    - czasową niedostępność Serwisu wynikającą z prac technicznych, awarii, działań osób trzecich, siły wyższej lub innych przyczyn niezależnych od Administratora,
    - treści dodawane przez Użytkowników, z zastrzeżeniem przypadków wynikających z bezwzględnie obowiązujących przepisów prawa.
5. Administrator może czasowo ograniczyć dostęp do Serwisu w związku z pracami technicznymi, rozwojem Serwisu, usuwaniem awarii lub względami bezpieczeństwa.

**§ 12. REKLAMACJE**

1. Reklamacje dotyczące funkcjonowania Serwisu lub realizacji usług świadczonych drogą elektroniczną należy zgłaszać na adres: [k.niemczyk@btsearch.pl](mailto:k.niemczyk@btsearch.pl).
2. Zgłoszenie reklamacyjne powinno zawierać w szczególności:
    - dane umożliwiające identyfikację Użytkownika,
    - adres e-mail do kontaktu,
    - opis problemu lub nieprawidłowości.
3. Administrator może zwrócić się do Użytkownika o uzupełnienie informacji niezbędnych do rozpatrzenia reklamacji.
4. Reklamacje rozpatrywane są w terminie 14 dni od dnia ich otrzymania, a w przypadku konieczności uzupełnienia danych - od dnia ich uzupełnienia.
5. O sposobie rozpatrzenia reklamacji Administrator informuje drogą elektroniczną.

**§ 13. ZMIANY REGULAMINU**

1. Administrator zastrzega sobie prawo do zmiany Regulaminu z ważnych przyczyn, w szczególności w przypadku:
    - zmiany przepisów prawa,
    - zmian technicznych lub organizacyjnych dotyczących Serwisu,
    - wprowadzenia nowych funkcjonalności, usług lub modyfikacji istniejących funkcjonalności,
    - konieczności dostosowania Regulaminu do aktualnych warunków bezpieczeństwa lub sposobu działania Serwisu.
2. Informacja o zmianie Regulaminu zostanie opublikowana w Serwisie, a w przypadku Użytkowników posiadających Konto może zostać dodatkowo przekazana drogą elektroniczną.
3. Zmiany Regulaminu wchodzą w życie po upływie 7 dni od dnia ich opublikowania, chyba że przepisy prawa wymagają innego terminu.
4. Dalsze korzystanie z Serwisu po wejściu zmian w życie oznacza akceptację nowego brzmienia Regulaminu.

**§ 14. POSTANOWIENIA KOŃCOWE**

1. Do Umowy zawartej pomiędzy Użytkownikiem a Administratorem zastosowanie ma prawo polskie.
2. Wszelkie spory wynikające z Umowy lub związane z korzystaniem z Serwisu będą w pierwszej kolejności rozstrzygane polubownie, a w przypadku braku porozumienia - przez sąd właściwy zgodnie z przepisami prawa powszechnie obowiązującego.
3. Jeżeli którekolwiek z postanowień Regulaminu zostanie uznane za nieważne, bezskuteczne lub niewykonalne, pozostałe postanowienia pozostają w mocy.
4. Regulamin jest udostępniony nieodpłatnie w Serwisie w formie umożliwiającej jego pozyskanie, odtworzenie i utrwalenie.
5. Regulamin wchodzi w życie z dniem jego publikacji w Serwisie i obowiązuje przez czas nieoznaczony.

**§ 15. LICENCJA KODU**

Kod źródłowy ${APP_NAME} jest udostępniony na licencji [GPL-3.0](https://github.com/btsearch/btsearch/blob/main/LICENSE).`;

function TosPage() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold">Regulamin</h1>
        <article className={markdownClasses}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
        </article>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/terms")({
  component: TosPage,
  staticData: {
    title: "Regulamin",
  },
});
