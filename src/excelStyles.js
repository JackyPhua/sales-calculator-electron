// Excel导出样式配置
module.exports = {
    styles: {
        headerStyle: {
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F81BD' }
            },
            font: {
                bold: true,
                size: 12,
                color: { argb: 'FFFFFFFF' }
            },
            alignment: { 
                horizontal: 'center',
                vertical: 'middle' 
            }
        },
        subHeaderStyle: {
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9E1F2' }
            },
            font: { 
                bold: true,
                size: 11,
                color: { argb: 'FF1F4E78' }
            },
            alignment: {
                horizontal: 'left',
                vertical: 'middle'
            }
        },
        moneyStyle: {
            font: { 
                bold: true,
                color: { argb: 'FF0070C0' }
            }
        },
        totalStyle: {
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF7030A0' }
            },
            font: {
                bold: true,
                color: { argb: 'FFFFFFFF' }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'middle'
            }
        }
    }
};