import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    'aiux-color-swatch|james-test-app': {
                        table: 'sys_aix_color_swatch'
                        id: '259bf22cdccf28c88a5661ac3349085c'
                        deleted: false
                    }
                    'aiux-experience-page-rel|x-snc-james-test-a-home-page': {
                        table: 'sys_aix_experience_page_rel'
                        id: 'ea646ae08e108a10ff5165b7e7298418'
                        deleted: false
                    }
                    'aiux-experience-page-rel|x-snc-james-test-a-incidents-page': {
                        table: 'sys_aix_experience_page_rel'
                        id: 'f5f2259cdd0eaa111e484a272e85f191'
                        deleted: true
                    }
                    'aiux-experience-prop|appHeadCss': {
                        table: 'sys_aix_experience_properties'
                        id: 'da650af3bc9be84059caabf77a031544'
                        deleted: false
                    }
                    'aiux-experience-prop|appTailwindCss': {
                        table: 'sys_aix_experience_properties'
                        id: 'd60aeb45ca8968783a8e89b155d6b208'
                        deleted: false
                    }
                    'aiux-experience|james-test-app': {
                        table: 'sys_aix_experience'
                        id: '28ec782502bf1e6ed44ddcce5178a684'
                        deleted: false
                    }
                    'aiux-layout-widget|lifecycle': {
                        table: 'sys_aix_widget'
                        id: '9ed2b7551d7be3e3490e28a0c7a7aea1'
                        deleted: false
                    }
                    'aiux-page-widget|x-snc-james-test-a-home-page': {
                        table: 'sys_aix_widget'
                        id: '1efb99430587bf91624978a14452a85e'
                        deleted: false
                    }
                    'aiux-page-widget|x-snc-james-test-a-incidents-page': {
                        table: 'sys_aix_widget'
                        id: '043bedc6db8cc9263dc9ddd33cf0bb98'
                        deleted: true
                    }
                    'aiux-page|x-snc-james-test-a-home-page': {
                        table: 'sys_aix_page'
                        id: 'fbf5ff97d2c798f4267bbe70b6934a75'
                        deleted: false
                    }
                    'aiux-page|x-snc-james-test-a-incidents-page': {
                        table: 'sys_aix_page'
                        id: '349f39f1d5671b7a1310cbdb231a5abe'
                        deleted: true
                    }
                    'aiux-theme|james-test-app': {
                        table: 'sys_aix_theme'
                        id: '07725a20a2c0d0e76377a2bae119b952'
                        deleted: false
                    }
                    'aiux-widget|aiux-ai-asset-honeycomb': {
                        table: 'sys_aix_widget'
                        id: '48c0090342cbcb65aa530eeead78d834'
                        deleted: false
                    }
                    'aiux-widget|aiux-hello-world': {
                        table: 'sys_aix_widget'
                        id: 'c616d0a8a265d45108b90f2fc4bf50b5'
                        deleted: false
                    }
                    bom_json: {
                        table: 'sys_module'
                        id: 'd3d7e5fa8bdd46e399b372f04879da2e'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'f81b67b8fc7a4f9eb4598d2a2801abf9'
                    }
                }
            }
        }
    }
}
