// utils/emergency.js

const EMERGENCY_TEXTS = {
  hu: `Az AI álomértelmezés jelenleg átmenetileg nem elérhető.

Ezekkel az irányított kérdésekkel ettől függetlenül elmélyülhetsz az álmodban:

Mi emelkedett ki a leginkább?
Gondolj a személyre, helyre, tárgyra vagy eseményre, ami a legfontosabbnak érződött.

Milyen érzéseket váltott ki belőled az álom?
Gondold át, hogy ugyanez az érzelem megjelent-e mostanában az ébrenléti életedben.

Mit jelenthetnek számodra a szimbólumok személyesen?
Az álomszimbólumoknak nincs egyetlen egyetemes jelentése. Gondold át a saját személyes kötődéseidet.

Mi változott az álom során?
Figyeld meg, mi történt a legerősebb pillanat előtt és után.

Összegzés
Az álmodnak nincs egyetlen kőbe vésett jelentése. Érdemes megfigyelned, hogyan kapcsolódik ahhoz, amit mostanában átéltél, amitől tartasz, amiben reménykedsz, vagy amire visszaemlékezel.`,

  de: `Die KI-Traumdeutung ist vorübergehend nicht verfügbar.

Mit diesen Leitfragen kannst du deinen Traum dennoch reflektieren:

Was stach am meisten hervor?
Denke an die Person, den Ort, den Gegenstand oder das Ereignis, das sich am wichtigsten anfühlte.

Wie hast du dich im Traum gefühlt?
Überlege, ob dasselbe Gefühl kürzlich in deinem Wachleben aufgetreten ist.

Was könnten die Symbole für dich persönlich bedeuten?
Traumsymbole haben keine universelle Bedeutung. Bedenke deine eigenen Assoziationen.

Was hat sich während des Traums verändert?
Beobachte, was vor und nach dem intensivsten Moment geschah.

Reflexion
Dein Traum hat keine feste Bedeutung. Überlege, wie er sich mit deinen jüngsten Erlebnissen, Sorgen oder Hoffnungen verbindet.`,

  fr: `L'interprétation des rêves par IA est temporairement indisponible.

Vous pouvez néanmoins réfléchir à votre rêve grâce à ces questions guidées :

Qu'est-ce qui ressortait le plus ?
Pensez à la personne, au lieu, à l'objet ou à l'événement qui vous a semblé le plus important.

Que ressentiez-vous pendant le rêve ?
Voyez si cette même émotion est apparue récemment dans votre vie éveillée.

Que pourraient signifier les symboles pour vous personnellement ?
Les symboles n'ont pas de signification universelle unique. Pensez à vos propres associations.

Qu'est-ce qui a changé au cours du rêve ?
Remarquez ce qui s'est passé avant et après le moment le plus marquant.

Réflexion
Votre rêve n'a pas de sens figé. Voyez comment il résonne avec ce que vous vivez, espérez ou ressentez actuellement.`,

  es: `La interpretación de sueños con IA no está disponible temporalmente.

Aun así, puedes reflexionar sobre tu sueño con estas preguntas guía:

¿Qué destacó más?
Piensa en la persona, lugar, objeto o evento que te pareció más importante.

¿Cómo te hizo sentir el sueño?
Considera si esa misma emoción ha surgido recientemente en tu vida cotidiana.

¿Qué podrían significar los símbolos para ti personalmente?
Los símbolos oníricos no tienen un único significado universal. Reflexiona sobre tus propias asociaciones.

¿Qué cambió durante el sueño?
Nota lo que sucedió antes y después del momento más intenso.

Reflexión
Tu sueño no tiene un significado fijo. Considera cómo se conecta con lo que has vivido, temido o esperado recientemente.`,

  it: `L'interpretazione dei sogni tramite IA è temporaneamente non disponibile.

Puoi comunque riflettere sul tuo sogno attraverso queste domande guida:

Cosa è risaltato di più?
Pensa alla persona, al luogo, all'oggetto o all'evento che ti è sembrato più significativo.

Come ti ha fatto sentire il sogno?
Considera se la stessa emozione è emersa di recente nella tua vita di veglia.

Cosa potrebbero significare i simboli per te personalmente?
I simboli dei sogni non hanno un unico significato universale. Pensa alle tue associazioni personali.

Cosa è cambiato durante il sogno?
Osserva cosa è accaduto prima e dopo il momento più intenso.

Riflessione
Il tuo sogno non ha un significato univoco. Valuta come si collega alle tue esperienze, speranze o preoccupazioni recenti.`,

  pt: `A interpretação de sonhos por IA está temporariamente indisponível.

Você ainda pode refletir sobre seu sonho com estas perguntas guiadas:

O que mais se destacou?
Pense na pessoa, lugar, objeto ou evento que pareceu mais importante.

Como o sonho fez você se sentir?
Considere se esse mesmo sentimento apareceu recentemente em sua vida desperta.

O que os símbolos podem significar para você pessoalmente?
Os símbolos dos sonhos não têm um único significado universal. Pense em suas próprias associações.

O que mudou durante o sonho?
Observe o que aconteceu antes e depois do momento mais marcante.

Reflexão
Seu sonho não possui um significado fixo. Considere como ele se conecta ao que você viveu, temeu ou esperou recentemente.`,

  ru: `ИИ-толкование снов временно недоступно.

Вы можете поразмышлять над своим сном с помощью этих наводящих вопросов:

Что запомнилось больше всего?
Подумайте о человеке, месте, предмете или событии, которое показалось самым важным.

Какие чувства вызвал у вас сон?
Подумайте, возникали ли подобные эмоции в вашей реальной жизни в последнее время.

Что эти символы могут значить лично для вас?
Символы сновидений не имеют универсального значения. Опирайтесь на свои личные ассоциации.

Что изменилось во время сна?
Обратите внимание на то, что произошло до и после самого яркого момента.

Размышление
У вашего сна нет единственного значения. Подумайте, как он связан с тем, что вы недавно пережили, о чем беспокоились или надеялись.`,

  zh: `AI 梦境解析暂时不可用。

您可以通过以下引导问题反思您的梦境：

梦中最突出的部分是什么？
想想感觉最重要的人物、地点、物品或事件。

这个梦让您产生了怎样的感受？
思考这种情绪最近是否在您的现实生活中出现过。

这些符号对您个人而言可能意味着什么？
梦境中的符号没有统一的标准答案，请结合您个人的经历和联想来思考。

梦境中发生了什么转变？
注意最强烈的情节发生前后有什么变化。

反思
梦境并非具有固定不变的含义。想想它是否与您最近经历的事情、担忧或希望有所关联。`,

  ja: `AIによる夢の解釈は現在一時的にご利用いただけません。

以下の問いかけを通して、ご自身の夢を振り返ってみましょう：

何が最も印象に残りましたか？
最も重要だと感じられた人物、場所、物、出来事を思い出してみてください。

夢の中でどんな感情を抱きましたか？
最近の日常生活の中で、同じような感情を感じたことがないか考えてみてください。

その象徴（シンボル）はあなたにとって何を意味するでしょうか？
夢のシンボルに絶対的な意味はありません。あなた自身の個人的な連想を大切にしてください。

夢の中でどんな変化がありましたか？
最も印象的な瞬間の前後に何が起きたかに注目してみましょう。

振り返り
夢に決まった唯一の答えはありません。最近の経験や不安、希望とどのように結びついているか考えてみてください。`,

  ko: `AI 꿈 해석을 일시적으로 이용할 수 없습니다.

다음 질문을 통해 꿈을 스스로 돌아보실 수 있습니다:

가장 돋보였던 것은 무엇인가요?
가장 중요하게 느껴졌던 인물, 장소, 사물 또는 사건을 떠올려 보세요.

꿈을 꾸는 동안 어떤 감정이 들었나요?
최근 일상생활에서도 비슷한 감정을 느낀 적이 있는지 생각해 보세요.

그 상징들이 개인적으로 어떤 의미를 가질까요?
꿈의 상징에는 정해진 하나의 의미만 있는 것이 아닙니다. 나만의 연상과 연결해 보세요.

꿈이 진행되면서 어떤 변화가 있었나요?
가장 강렬했던 순간의 전후에 무슨 일이 일어났는지 살펴보세요.

되돌아보기
꿈에는 고정된 정답이 없습니다. 최근 겪은 일, 걱정거리, 혹은 희망과 어떻게 연결되는지 살펴보세요.`,

  ar: `تفسير الأحلام بالذكاء الاصطناعي غير متاح مؤقتاً.

لا يزال بإمكانك التأمل في حلمك من خلال هذه الأسئلة الإرشادية:

ما هو الشيء الأكثر بروزاً في الحلم؟
فكر في الشخص أو المكان أو الشيء أو الحدث الذي شعرت بأنه الأهم.

كيف جعلك الحلم تشعر؟
فكر فيما إذا كان نفس الشعور قد راودك مؤخراً في حياتك اليومية.

ماذا قد تعني الرموز بالنسبة لك شخصياً؟
رموز الأحلام ليس لها معنى موحد وثابت. فكر في ارتباطاتك الشخصية بها.

ما الذي تغير أثناء الحلم؟
لاحظ ما حدث قبل وبعد اللحظة الأكثر تأثيراً.

تأمل
حلمك ليس له معنى واحد محدد. تأمل في كيفية ارتباطه بما مررت به مؤخراً من تجارب أو آمال أو مخاوف.`,

  default: `AI interpretation is temporarily unavailable.

You can still reflect on your dream with these guided questions:

What stood out most?
Think about the person, place, object, or event that felt most important.

How did the dream make you feel?
Consider whether the same emotion has appeared recently in your waking life.

What might the symbols mean to you personally?
Dream symbols do not have one universal meaning. Think about your own associations with them.

What changed during the dream?
Notice what happened before and after the strongest moment.

Reflection
Your dream does not have one fixed meaning. Consider whether it connects to something you have recently experienced, worried about, hoped for, or remembered.`,
};

function getEmergencyReflectionText(langCode) {
  const normalized = (langCode || "en").toLowerCase().split("-")[0];
  return EMERGENCY_TEXTS[normalized] || EMERGENCY_TEXTS.default;
}

function buildEmergencyPayload({ reason = "budget_or_provider_unavailable", language = "en" } = {}) {
  const deltaText = getEmergencyReflectionText(language);
  return {
    type: "emergency",
    mode: "reflection_common_dreams",
    provider: "emergency",
    reason: String(reason),
    delta: deltaText,
  };
}

module.exports = {
  EMERGENCY_TEXTS,
  getEmergencyReflectionText,
  buildEmergencyPayload,
};
