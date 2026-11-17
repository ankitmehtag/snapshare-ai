/**
 * PUB-03 legal texts. DRAFTS written from the product spec (SECURITY §8, DPDP Act 2023)
 * — not legal advice and not in force until reviewed by a lawyer (ARCHITECTURAL_GAPS
 * G18). Each document is versioned so consent can record which text was accepted.
 */
export type LegalDocKey = 'terms' | 'privacy' | 'biometric';

interface Section {
  heading: string;
  body: string[];
}
export interface LegalDoc {
  version: string;
  sections: Section[];
}

export const LEGAL: Record<LegalDocKey, Record<'en' | 'hi', LegalDoc>> = {
  terms: {
    en: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'Who we are',
          body: [
            'SnapShare provides tools for photographers and studios to deliver photos to clients and guests, and for families to share photos privately.',
          ],
        },
        {
          heading: 'Your account',
          body: [
            'You must give accurate details and keep your password safe. You are responsible for activity on your account. Tell us at once if you think someone else has access.',
          ],
        },
        {
          heading: 'Your content',
          body: [
            'You keep ownership of the photos you upload. You give us permission to store, process and display them only to provide the service you asked for.',
            'You confirm you have the right to upload the photos and to share them with the people you invite.',
          ],
        },
        {
          heading: 'Studios and their clients',
          body: [
            'A studio decides who can see its galleries. When a studio uses SnapShare for its clients, the studio is responsible for having a lawful basis to share those photos.',
          ],
        },
        {
          heading: 'Acceptable use',
          body: [
            'Do not upload illegal content, content that exploits children, or content you have no right to share. Do not try to access other accounts or disrupt the service. We may suspend accounts that break these rules.',
          ],
        },
        {
          heading: 'Plans and payment',
          body: [
            'Paid plans, limits and prices are shown before you buy. During the beta, accounts are free. Taxes such as GST apply as required by law.',
          ],
        },
        {
          heading: 'Ending your account',
          body: [
            'You can delete a studio or your account. Deletion has a grace period during which you can change your mind; after it, data is permanently removed.',
          ],
        },
        {
          heading: 'Contact',
          body: [
            'Questions about these terms: support@snapshare.in (address to be confirmed before launch).',
          ],
        },
      ],
    },
    hi: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'हम कौन हैं',
          body: [
            'SnapShare फ़ोटोग्राफ़रों और स्टूडियो को अपने क्लाइंट और मेहमानों तक फ़ोटो पहुंचाने, और परिवारों को निजी तौर पर फ़ोटो शेयर करने के टूल देता है।',
          ],
        },
        {
          heading: 'आपका खाता',
          body: [
            'आपको सही जानकारी देनी होगी और अपना पासवर्ड सुरक्षित रखना होगा। आपके खाते की गतिविधि की ज़िम्मेदारी आपकी है। अगर लगे कि किसी और के पास एक्सेस है, तो तुरंत हमें बताएं।',
          ],
        },
        {
          heading: 'आपकी सामग्री',
          body: [
            'आपके अपलोड किए फ़ोटो के मालिक आप ही रहते हैं। आप हमें इन्हें केवल आपकी मांगी गई सेवा देने के लिए स्टोर, प्रोसेस और दिखाने की अनुमति देते हैं।',
            'आप पुष्टि करते हैं कि आपको फ़ोटो अपलोड करने और आमंत्रित लोगों के साथ शेयर करने का अधिकार है।',
          ],
        },
        {
          heading: 'स्टूडियो और उनके क्लाइंट',
          body: [
            'कौन स्टूडियो की गैलरी देख सकता है, यह स्टूडियो तय करता है। अपने क्लाइंट के लिए SnapShare का उपयोग करते समय, उन फ़ोटो को शेयर करने का कानूनी आधार रखना स्टूडियो की ज़िम्मेदारी है।',
          ],
        },
        {
          heading: 'स्वीकार्य उपयोग',
          body: [
            'गैर-कानूनी सामग्री, बच्चों का शोषण करने वाली सामग्री, या जिसे शेयर करने का आपको अधिकार नहीं, ऐसी सामग्री अपलोड न करें। दूसरे खातों तक पहुंचने या सेवा में बाधा डालने की कोशिश न करें। नियम तोड़ने वाले खाते हम निलंबित कर सकते हैं।',
          ],
        },
        {
          heading: 'प्लान और भुगतान',
          body: [
            'पेड प्लान, सीमाएं और कीमतें खरीदने से पहले दिखाई जाती हैं। बीटा के दौरान खाते मुफ़्त हैं। GST जैसे कर कानून के अनुसार लागू होते हैं।',
          ],
        },
        {
          heading: 'खाता बंद करना',
          body: [
            'आप स्टूडियो या अपना खाता हटा सकते हैं। हटाने पर एक मोहलत मिलती है जिसमें आप फ़ैसला बदल सकते हैं; उसके बाद डेटा हमेशा के लिए हटा दिया जाता है।',
          ],
        },
        {
          heading: 'संपर्क',
          body: ['इन शर्तों के बारे में सवाल: support@snapshare.in (लॉन्च से पहले पता पक्का किया जाएगा)।'],
        },
      ],
    },
  },
  privacy: {
    en: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'What we collect',
          body: [
            'Account details (name, email, password stored only as a secure hash), photos you or your studio upload, and basic technical data such as device type. IP addresses are stored only in a one-way hashed form.',
          ],
        },
        {
          heading: 'Why we use it',
          body: [
            'To run your account, deliver galleries, keep the service secure (for example, detecting suspicious sign-ins) and send emails you need, such as sign-in links and invitations. We do not sell your data or use it for advertising.',
          ],
        },
        {
          heading: 'Where it is processed',
          body: [
            'On our own servers and with a small number of service providers (hosting, storage, email), under contracts that limit their use of the data. Face recognition never uses third-party services.',
          ],
        },
        {
          heading: 'Your rights (DPDP Act 2023)',
          body: [
            'You can access, correct and delete your personal data, withdraw consent, and nominate someone to exercise your rights. Contact our grievance officer (details to be published before launch).',
          ],
        },
        {
          heading: 'How long we keep it',
          body: [
            'Only as long as needed for the purpose. Galleries follow the expiry the studio sets. Security logs are kept for up to two years.',
          ],
        },
        {
          heading: 'Security',
          body: [
            'Encryption in transit, hashed passwords, strict separation between studios, and audit logs of sensitive actions. If a breach affects you, we will tell you and the Data Protection Board as the law requires.',
          ],
        },
      ],
    },
    hi: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'हम क्या एकत्र करते हैं',
          body: [
            'खाते की जानकारी (नाम, ईमेल, पासवर्ड केवल सुरक्षित हैश के रूप में), आपके या आपके स्टूडियो के अपलोड किए फ़ोटो, और डिवाइस के प्रकार जैसी बुनियादी तकनीकी जानकारी। IP पते केवल एकतरफ़ा हैश के रूप में रखे जाते हैं।',
          ],
        },
        {
          heading: 'हम इसका उपयोग क्यों करते हैं',
          body: [
            'आपका खाता चलाने, गैलरी पहुंचाने, सेवा सुरक्षित रखने (जैसे संदिग्ध साइन-इन पहचानना) और ज़रूरी ईमेल जैसे साइन-इन लिंक और आमंत्रण भेजने के लिए। हम आपका डेटा न बेचते हैं, न विज्ञापन के लिए इस्तेमाल करते हैं।',
          ],
        },
        {
          heading: 'प्रोसेसिंग कहां होती है',
          body: [
            'हमारे अपने सर्वर पर और कुछ सेवा प्रदाताओं (होस्टिंग, स्टोरेज, ईमेल) के साथ, ऐसे अनुबंधों के तहत जो उनके डेटा उपयोग को सीमित करते हैं। फ़ेस रिकग्निशन कभी किसी तीसरे पक्ष की सेवा का उपयोग नहीं करता।',
          ],
        },
        {
          heading: 'आपके अधिकार (DPDP अधिनियम 2023)',
          body: [
            'आप अपने व्यक्तिगत डेटा तक पहुंच, सुधार और हटाने, सहमति वापस लेने, और अपने अधिकारों के लिए किसी को नामित करने का अधिकार रखते हैं। हमारे शिकायत अधिकारी से संपर्क करें (विवरण लॉन्च से पहले प्रकाशित होगा)।',
          ],
        },
        {
          heading: 'हम इसे कितने समय तक रखते हैं',
          body: [
            'केवल उतने समय तक जितना उद्देश्य के लिए ज़रूरी है। गैलरी स्टूडियो की तय की गई समाप्ति तक रहती है। सुरक्षा लॉग अधिकतम दो साल रखे जाते हैं।',
          ],
        },
        {
          heading: 'सुरक्षा',
          body: [
            'ट्रांज़िट में एन्क्रिप्शन, हैश किए पासवर्ड, स्टूडियो के बीच सख्त अलगाव, और संवेदनशील कार्यों के ऑडिट लॉग। अगर किसी सेंधमारी का असर आप पर पड़ता है, तो हम कानून के अनुसार आपको और डेटा प्रोटेक्शन बोर्ड को बताएंगे।',
          ],
        },
      ],
    },
  },
  biometric: {
    en: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'Optional and consent-first',
          body: [
            'Finding your photos with a selfie is optional. You can always browse the gallery instead. We ask for your explicit consent before any face processing.',
          ],
        },
        {
          heading: 'What happens to your selfie',
          body: [
            'Your selfie is turned into a numeric face template on our own servers and the selfie image is deleted right after. The template is compared only with photos from the event you are viewing.',
          ],
        },
        {
          heading: 'Who sees the results',
          body: [
            'Only you. Matches are limited to one event, never across studios or events, and are never shared with third parties.',
          ],
        },
        {
          heading: 'Withdrawing consent',
          body: [
            'You can withdraw consent at any time. Your face data is then deleted, and deletion is verified.',
          ],
        },
        { heading: 'Children', body: ['People under 18 cannot use selfie search.'] },
        {
          heading: 'Status',
          body: [
            'Face search is not live yet. It is planned for a later phase and will only launch after legal review of this notice.',
          ],
        },
      ],
    },
    hi: {
      version: '0.1-draft',
      sections: [
        {
          heading: 'वैकल्पिक और सहमति पहले',
          body: [
            'सेल्फ़ी से अपनी फ़ोटो ढूंढना वैकल्पिक है। आप हमेशा गैलरी ब्राउज़ कर सकते हैं। किसी भी फ़ेस प्रोसेसिंग से पहले हम आपकी स्पष्ट सहमति मांगते हैं।',
          ],
        },
        {
          heading: 'आपकी सेल्फ़ी का क्या होता है',
          body: [
            'आपकी सेल्फ़ी हमारे अपने सर्वर पर एक संख्यात्मक फ़ेस टेम्पलेट में बदली जाती है और सेल्फ़ी इमेज तुरंत हटा दी जाती है। टेम्पलेट की तुलना केवल उसी इवेंट के फ़ोटो से होती है जिसे आप देख रहे हैं।',
          ],
        },
        {
          heading: 'नतीजे कौन देखता है',
          body: [
            'सिर्फ़ आप। मिलान एक ही इवेंट तक सीमित रहते हैं, कभी स्टूडियो या इवेंट के पार नहीं, और कभी किसी तीसरे पक्ष के साथ शेयर नहीं होते।',
          ],
        },
        {
          heading: 'सहमति वापस लेना',
          body: [
            'आप कभी भी सहमति वापस ले सकते हैं। तब आपका फ़ेस डेटा हटा दिया जाता है, और हटाने की पुष्टि की जाती है।',
          ],
        },
        { heading: 'बच्चे', body: ['18 साल से कम उम्र के लोग सेल्फ़ी सर्च का उपयोग नहीं कर सकते।'] },
        {
          heading: 'स्थिति',
          body: [
            'फ़ेस सर्च अभी लाइव नहीं है। यह बाद के फ़ेज़ में आएगा और इस सूचना की कानूनी समीक्षा के बाद ही शुरू होगा।',
          ],
        },
      ],
    },
  },
};
