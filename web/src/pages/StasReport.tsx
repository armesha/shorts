import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowDown,
  Check,
  ExternalLink,
  FileCheck2,
  FileText,
  FlaskConical,
  Scale,
} from "lucide-react";
import "../styles/stas-report.css";

const sources = {
  torlonGuide: "https://www.solvay.com/sites/g/files/srpend616/files/2018-08/Torlon-PAI-Design-Guide_EN-v5.0_0.pdf",
  torlonSheet: "https://www.solvay.com/sites/g/files/srpend616/files/2018-10/Oil-Gas-Specialty-Polymers_EN-v2.5_0.pdf",
  duratron: "https://www.mcam.com/mam/54261/AEP-Duratron%E2%84%A2%20T4203%20PAI_en_US.pdf",
  gost9049: "https://files.stroyinf.ru/Data/281/28194.pdf",
  gost9048: "https://meganorm.ru/Data2/1/4294821/4294821250.htm",
  gost10589: "https://files.stroyinf.ru/Data2/1/4293747/4293747411.pdf",
  gost10007: "https://meganorm.ru/Data2/1/4294840/4294840557.htm",
  gostR57859: "https://normadocs.ru/gost_r_57859-2017",
};

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="stas-source-link" href={href} target="_blank" rel="noreferrer">
      <span>{children}</span>
      <ExternalLink aria-hidden="true" size={15} strokeWidth={1.8} />
    </a>
  );
}

function VerdictIcon({ type }: { type: "best" | "qualified" | "no" }) {
  if (type === "best") return <Scale aria-hidden="true" size={19} />;
  if (type === "qualified") return <Check aria-hidden="true" size={19} />;
  return <AlertTriangle aria-hidden="true" size={19} />;
}

export default function StasReport() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Аналоги Torlon 4203L — проверка грибостойкости";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="stas-report">
      <header className="stas-hero">
        <div className="stas-hero__inner">
          <div className="stas-meta">
            <span>Техническая записка</span>
            <span aria-hidden="true">·</span>
            <time dateTime="2026-08-14">14.08.2026</time>
          </div>
          <h1>Чем заменить Torlon 4203L, если нужна доказанная грибостойкость</h1>
          <p className="stas-lead">
            Проверка открытых паспортов материалов и нормативных документов. Главный результат — без
            маркетинговых допущений и подмены испытания материала испытанием готового изделия.
          </p>
          <a className="stas-jump" href="#result">
            Сразу к выводу <ArrowDown aria-hidden="true" size={17} />
          </a>
        </div>
      </header>

      <div className="stas-shell">
        <section className="stas-finding" id="result" aria-labelledby="result-title">
          <div className="stas-finding__icon"><FileCheck2 aria-hidden="true" size={24} /></div>
          <div>
            <h2 id="result-title">Строгий вывод</h2>
            <p>
              <strong>Прямой заменитель Torlon 4203L с открытым подтверждением грибостойкости по ГОСТ
              9.049-91 или ГОСТ 9.048-89 не найден.</strong> Ближайший по материалу и характеристикам
              вариант — ненаполненный PAI Duratron T4203, но его открытая НД не содержит результата
              испытаний на плесневые грибы.
            </p>
            <p>
              Если нельзя снижать прочность и рабочую температуру, корректный путь — выбрать PAI и
              квалифицировать конкретную марку, партию и затем изделие. Если допустима смена класса
              материала, грибостойкость открыто подтверждена у ПА 610 и фторопласта-4, однако оба не
              являются полноценной механической заменой Torlon.
            </p>
          </div>
        </section>

        <section className="stas-section" aria-labelledby="baseline-title">
          <div className="stas-section__heading">
            <FlaskConical aria-hidden="true" size={22} />
            <h2 id="baseline-title">Что именно заменяем</h2>
          </div>
          <p>
            Torlon 4203L — ненаполненный литьевой полиамидоимид (PAI) общего назначения. Производитель
            выделяет высокую прочность и жёсткость при температурах до 260 °C, ударную вязкость,
            размерную стабильность и электроизоляционные свойства. В руководстве также указано, что
            марка 4203 имеет эквивалентные свойства 4203L.
          </p>
          <div className="stas-facts" aria-label="Ключевые свойства Torlon 4203L">
            <div><strong>PAI</strong><span>ненаполненный</span></div>
            <div><strong>260 °C</strong><span>верхняя граница применения семейства</span></div>
            <div><strong>≈ 4,5 ГПа</strong><span>модуль упругости при растяжении</span></div>
          </div>
          <div className="stas-inline-sources">
            <SourceLink href={sources.torlonGuide}>Syensqo / Solvay: Torlon PAI Design Guide</SourceLink>
            <SourceLink href={sources.torlonSheet}>Torlon 4203L: свойства при разных температурах</SourceLink>
          </div>
        </section>

        <section className="stas-section" aria-labelledby="candidates-title">
          <div className="stas-section__heading">
            <Scale aria-hidden="true" size={22} />
            <h2 id="candidates-title">Кандидаты и границы применимости</h2>
          </div>

          <div className="stas-comparison">
            <article className="stas-candidate stas-candidate--best">
              <div className="stas-candidate__top">
                <div className="stas-candidate__verdict"><VerdictIcon type="best" /> Ближайший по назначению</div>
                <h3>Duratron T4203 PAI</h3>
                <p>Ненаполненный PAI в виде стержней, плит и труб для механической обработки.</p>
              </div>
              <dl>
                <div><dt>Сходство</dt><dd>PAI; 260 °C непрерывно на воздухе; модуль 4,2 ГПа; высокая размерная стабильность.</dd></div>
                <div><dt>Грибостойкость</dt><dd className="stas-status stas-status--missing">В открытом паспорте не заявлена и метод испытания не указан.</dd></div>
                <div><dt>Решение</dt><dd>Рассматривать только с отдельным протоколом испытаний конкретной поставки.</dd></div>
              </dl>
              <SourceLink href={sources.duratron}>Паспорт производителя, 2025</SourceLink>
            </article>

            <article className="stas-candidate">
              <div className="stas-candidate__top">
                <div className="stas-candidate__verdict"><VerdictIcon type="qualified" /> Свойство подтверждено НД</div>
                <h3>Полиамид 610 по ГОСТ 10589-2016</h3>
                <p>Литьевой алифатический полиамид с прямой формулировкой «грибостоек» в стандарте.</p>
              </div>
              <dl>
                <div><dt>Подтверждение</dt><dd className="stas-status stas-status--yes">ГОСТ 10589-2016 прямо устанавливает грибостойкость материала.</dd></div>
                <div><dt>Ограничение</dt><dd>Рабочий интервал без снижения механических свойств только от −60 до +70 °C.</dd></div>
                <div><dt>Вердикт</dt><dd>Не замена Torlon для высокотемпературной нагруженной детали; годится лишь после пересмотра требований.</dd></div>
              </dl>
              <SourceLink href={sources.gost10589}>ГОСТ 10589-2016, полный PDF</SourceLink>
            </article>

            <article className="stas-candidate">
              <div className="stas-candidate__top">
                <div className="stas-candidate__verdict"><VerdictIcon type="qualified" /> Результат указан в НД</div>
                <h3>Фторопласт-4 по ГОСТ 10007-80</h3>
                <p>ПТФЭ с высокой химической стойкостью и рабочей температурой до 260 °C.</p>
              </div>
              <dl>
                <div><dt>Подтверждение</dt><dd className="stas-status stas-status--yes">В приложении: стойкость к грибкам — 1 балл по ГОСТ 9.049.</dd></div>
                <div><dt>Ограничение</dt><dd>Существенно ниже прочность и жёсткость, выраженная ползучесть; другая технология изготовления.</dd></div>
                <div><dt>Вердикт</dt><dd>Возможен как химически и термически стойкий материал для ненагруженных деталей, но не как силовой аналог PAI.</dd></div>
              </dl>
              <SourceLink href={sources.gost10007}>ГОСТ 10007-80, открытый текст</SourceLink>
            </article>
          </div>
        </section>

        <section className="stas-section stas-standards" aria-labelledby="standards-title">
          <div className="stas-section__heading">
            <FileText aria-hidden="true" size={22} />
            <h2 id="standards-title">Как читать требования ГОСТ</h2>
          </div>
          <div className="stas-standards__grid">
            <div>
              <h3>ГОСТ 9.049-91 — материал</h3>
              <p>Испытывают полимерный материал или его компонент. Стандарт задаёт три метода и оценку развития грибов.</p>
              <SourceLink href={sources.gost9049}>Полный PDF ГОСТ 9.049-91</SourceLink>
            </div>
            <div>
              <h3>ГОСТ 9.048-89 — изделие</h3>
              <p>Испытывают готовое техническое изделие. Метод и допустимый показатель должны быть закреплены в НД на изделие или программе испытаний.</p>
              <SourceLink href={sources.gost9048}>Открытый текст ГОСТ 9.048-89</SourceLink>
            </div>
            <div>
              <h3>ГОСТ Р 57859-2017 — композит</h3>
              <p>Метод для полимерных композитов, модифицированный относительно ASTM G21-15. Полезен, если применяется наполненный PAI или иной композит.</p>
              <SourceLink href={sources.gostR57859}>Открытый текст ГОСТ Р 57859-2017</SourceLink>
            </div>
          </div>
          <aside className="stas-note">
            <AlertTriangle aria-hidden="true" size={20} />
            <p><strong>Сертификат на сырьё не закрывает требование к изделию.</strong> Смазка после мехобработки, краситель, наполнитель, клей и загрязнение поверхности способны изменить результат.</p>
          </aside>
        </section>

        <section className="stas-section" aria-labelledby="plan-title">
          <div className="stas-section__heading">
            <FileCheck2 aria-hidden="true" size={22} />
            <h2 id="plan-title">Практический маршрут закупки</h2>
          </div>
          <ol className="stas-steps">
            <li><span>1</span><div><strong>Зафиксировать обязательные свойства детали.</strong><p>Температура, нагрузка, ползучесть, диэлектрические требования, среда, форма поставки и способ изготовления.</p></div></li>
            <li><span>2</span><div><strong>Для сохранения уровня Torlon выбрать ненаполненный PAI.</strong><p>Duratron T4203 — наиболее близкая документированная отправная точка, но не доказательство грибостойкости.</p></div></li>
            <li><span>3</span><div><strong>Запросить у поставщика открываемый протокол.</strong><p>В нём должны быть марка, изготовитель, партия, метод, балл, срок выдержки и лаборатория. Фраза «не поддерживает рост грибов» без метода недостаточна.</p></div></li>
            <li><span>4</span><div><strong>При отсутствии протокола провести квалификацию.</strong><p>Сначала материал по ГОСТ 9.049-91, затем готовое изделие по ГОСТ 9.048-89, если требование относится к изделию.</p></div></li>
          </ol>
        </section>

        <section className="stas-decision" aria-labelledby="decision-title">
          <h2 id="decision-title">Рекомендация</h2>
          <p>
            Для нагруженной детали при высокой температуре не заменять Torlon 4203L на ПА 610 или
            фторопласт-4 только ради формального признака грибостойкости. Выбрать ненаполненный PAI,
            включить в спецификацию испытание по ГОСТ 9.049-91 с допустимым баллом и потребовать
            протокол на конкретную марку. Для готового узла дополнительно закрепить проверку по ГОСТ
            9.048-89.
          </p>
          <div className="stas-decision__line">
            <span>Ближайший материал</span><strong>Duratron T4203 PAI</strong>
            <span>Условие допуска</span><strong>отдельный протокол грибостойкости</strong>
          </div>
        </section>

        <footer className="stas-footer">
          <p>Материал подготовлен по открытым документам. Это технический скрининг, а не сертификат соответствия и не замена испытаний конкретной партии или изделия.</p>
        </footer>
      </div>
    </main>
  );
}
