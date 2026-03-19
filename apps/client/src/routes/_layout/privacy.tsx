import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownClasses =
  "space-y-4 text-sm text-muted-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:pt-4 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:space-y-2 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a:hover]:opacity-80 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_strong]:text-foreground [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-md [&_table]:border [&_table]:border-border [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr:nth-child(even)_td]:bg-muted/30";

const REMARK_PLUGINS = [remarkGfm];

const content = `**POLITYKA PRYWATNOŚCI SERWISU BTSearch**

Administratorem danych osobowych jest Krzysztof Niemczyk, e-mail: [k.niemczyk@btsearch.pl](mailto:k.niemczyk@btsearch.pl) (dalej: „Administrator").

Poniżej przedstawiamy informacje dotyczące przetwarzania danych osobowych w związku z korzystaniem z Serwisu **BTSearch**.

**§ 1. CELE PRZETWARZANIA DANYCH, PODSTAWY PRAWNE I OKRES PRZECHOWYWANIA**

| **Cel przetwarzania danych osobowych**                                                                                                  | **Podstawa przetwarzania danych oraz okres ich przechowywania**                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Działania zmierzające do zawarcia i realizacji Umowy o świadczenie usług drogą elektroniczną (rejestracja Konta, dostęp do Serwisu)** | Dane osobowe przetwarzane są na podstawie art. 6 ust. 1 lit. b RODO (wykonanie umowy) - w przypadku Użytkowników będących osobami fizycznymi. W przypadku osób reprezentujących przedsiębiorców - na podstawie art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora polegający na realizacji współpracy). Dane przetwarzane są przez okres obowiązywania Umowy oraz po jej zakończeniu przez okres przedawnienia roszczeń. |
| **Obsługa formularza kontaktowego oraz komunikacja z Użytkownikiem**                                                                    | Dane przetwarzane są na podstawie art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora polegający na udzieleniu odpowiedzi). Dane przetwarzane są przez czas niezbędny do udzielenia odpowiedzi oraz przez okres przedawnienia roszczeń.                                                                                                                                                                                   |
| **Analiza korzystania z Serwisu (statystyki, rozwój funkcjonalności)**                                                                  | Dane przetwarzane są na podstawie art. 6 ust. 1 lit. f RODO (uzasadniony interes Administratora polegający na rozwoju Serwisu). Dane przetwarzane są przez okres niezbędny do realizacji celu analitycznego.                                                                                                                                                                                                                                |
| **Ustalenie, dochodzenie i obrona przed roszczeniami**                                                                                  | Dane przetwarzane są na podstawie art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora). Dane przetwarzane są do czasu przedawnienia roszczeń.                                                                                                                                                                                                                                                                             |
| **Realizacja obowiązków prawnych ciążących na Administratorze**                                                                         | Dane przetwarzane są na podstawie art. 6 ust. 1 lit. c RODO i przechowywane przez okres wynikający z przepisów prawa.                                                                                                                                                                                                                                                                                                                       |

**§ 2. TREŚCI UŻYTKOWNIKÓW, W TYM ZDJĘCIA**

1. Użytkownicy Serwisu mogą dodawać Treści, w tym zdjęcia, opisy oraz inne materiały związane z infrastrukturą telekomunikacyjną.
2. Dodawane treści mogą potencjalnie zawierać dane osobowe, w szczególności:
    - wizerunek osób fizycznych,
    - dane identyfikujące osoby trzecie,
    - inne informacje umożliwiające pośrednią identyfikację.
3. Użytkownik, dodając Treści do Serwisu, oświadcza, że:
    - posiada prawo do ich publikacji,
    - przetwarzanie danych osobowych zawartych w tych treściach odbywa się zgodnie z obowiązującymi przepisami prawa.
4. Administrator nie weryfikuje każdorazowo legalności przetwarzania danych osobowych zawartych w Treściach Użytkowników, jednak podejmuje działania w przypadku zgłoszenia naruszenia.
5. W przypadku zgłoszenia naruszenia danych osobowych lub prawa do wizerunku Administrator może:
    - usunąć lub zablokować treść,
    - ograniczyć dostęp do niej,
    - podjąć inne działania przewidziane prawem.

**§ 3. ODBIORCY DANYCH OSOBOWYCH**

Dostęp do danych osobowych mogą mieć wyłącznie podmioty świadczące na rzecz Administratora usługi:

- hostingowe,
- informatyczne,
- księgowe,
- analityczne.

Podmioty te przetwarzają dane na podstawie umów zawartych z Administratorem i wyłącznie zgodnie z jego poleceniami.

**§ 4. PRZEKAZYWANIE DANYCH DO PAŃSTW TRZECICH**

Dane osobowe, co do zasady przetwarzane są na terenie Europejskiego Obszaru Gospodarczego (EOG).
W przypadku korzystania z narzędzi informatycznych dostawców mających siedzibę poza EOG, dane mogą być przekazywane na podstawie:

- decyzji stwierdzającej odpowiedni stopień ochrony,
- standardowych klauzul umownych zatwierdzonych przez Komisję Europejską,
- innych mechanizmów przewidzianych w RODO.

**§ 5. PRAWA OSÓB, KTÓRYCH DANE DOTYCZĄ**

Przysługuje Państwu prawo do:

- dostępu do danych osobowych (art. 15 RODO),
- otrzymania kopii danych (art. 15 ust. 3 RODO),
- sprostowania danych (art. 16 RODO),
- usunięcia danych (art. 17 RODO),
- ograniczenia przetwarzania (art. 18 RODO),
- przenoszenia danych (art. 20 RODO),
- wniesienia sprzeciwu wobec przetwarzania (art. 21 RODO).

Mają Państwo również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.
W celu realizacji praw należy skontaktować się z Administratorem pod adresem: [k.niemczyk@btsearch.pl](mailto:k.niemczyk@btsearch.pl)

**§ 6. OBOWIĄZEK PODANIA DANYCH**

Podanie danych osobowych jest:

- dobrowolne,
- jednak niezbędne do zawarcia i realizacji Umowy,
- wymagane w zakresie, w jakim wynika to z przepisów prawa (np. dane do faktury).

Brak podania danych może uniemożliwić korzystanie z Serwisu.

**§ 7. PROFILOWANIE I ZAUTOMATYZOWANE DECYZJE**

Administrator nie przetwarza danych osobowych w sposób zautomatyzowany prowadzący do podejmowania decyzji wywołujących wobec Użytkownika skutki prawne lub w podobny sposób istotnie na niego wpływające.
Dane mogą być wykorzystywane do analiz statystycznych oraz poprawy funkcjonalności Serwisu, jednak nie stanowi to zautomatyzowanego podejmowania decyzji w rozumieniu art. 22 RODO.

**§ 8. PLIKI COOKIES**

Serwis **BTSearch** wykorzystuje pliki cookies w celu:

- zapewnienia prawidłowego działania Serwisu,
- utrzymania sesji Użytkownika,
- analizy statystyk korzystania z Serwisu,
- prowadzenia działań marketingowych (jeżeli Użytkownik wyraził zgodę).

Serwis może wykorzystywać m.in. pliki:
- niezbędne (session_id, csrf_token),
- statystyczne (_ga, _gid),
- marketingowe (_fbp, _gcl_au).

Użytkownik może zarządzać plikami cookies za pomocą ustawień przeglądarki lub poprzez narzędzie zarządzania zgodami dostępne w Serwisie.

**§ 9. TECHNOLOGIE DODATKOWE**

Serwis może wykorzystywać localStorage do przechowywania:
  - ustawień interfejsu,
  - preferencji użytkownika.

Dane te przechowywane są lokalnie na urządzeniu użytkownika.

**§ 10. ŚRODKI BEZPIECZEŃSTWA**

Administrator stosuje odpowiednie środki techniczne i organizacyjne zapewniające ochronę danych osobowych, w szczególności:

- szyfrowanie połączeń (SSL),
- kontrolę dostępu do systemów,
- regularne aktualizacje oprogramowania,
- zabezpieczenia przed nieautoryzowanym dostępem.

**§ 11. ZMIANY POLITYKI PRYWATNOŚCI**

Administrator może dokonywać zmian Polityki Prywatności w przypadku zmiany przepisów prawa, zmian technologicznych lub organizacyjnych.

Aktualna wersja dokumentu jest dostępna w Serwisie.`;

function PrivacyPage() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold">Polityka prywatności</h1>
        <article className={markdownClasses}>
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/privacy")({
  component: PrivacyPage,
  staticData: {
    title: "Polityka prywatności",
  },
});
